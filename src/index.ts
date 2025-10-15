export interface Env {
	VECTORIZE: Vectorize;
	AI: Ai;
	OPENROUTER_API_KEY: string;
	messageId: KVNamespace;
  }
  interface EmbeddingResponse {
	shape: number[];
	data: number[][];
  }

  interface OpenRouterMessage {
	role: "user" | "assistant" | "system";
	content: string | Array<{
	  type: "text" | "image_url";
	  text?: string;
	  image_url?: {
		url: string;
	  };
	}>;
  }

  interface OpenRouterResponse {
	choices: Array<{
	  message: {
		content: string;
	  };
	}>;
  }

  interface VectorizeVector {
	id: string;
	values: number[];
	metadata?: {
	  memory?: string;
	  timestamp?: string;
	  type?: string;
	};
  }

  async function callOpenRouter(env: Env, messages: OpenRouterMessage[]): Promise<string> {
	const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
	  method: "POST",
	  headers: {
		"Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
		"Content-Type": "application/json"
	  },
	  body: JSON.stringify({
		model: "mistralai/mistral-small-3.1-24b-instruct:free",
		messages: messages
	  })
	});

	if (!response.ok) {
	  throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
	}

	const data: OpenRouterResponse = await response.json();
	return data.choices[0]?.message?.content || "No response generated";
  }

  async function storeUserMemory(env: Env, userMessage: string): Promise<void> {
	try {
	  // Generate embeddings for the user message directly
	  const modelResp: EmbeddingResponse = await env.AI.run(
		"@cf/baai/bge-base-en-v1.5",
		{
		  text: [userMessage],
		},
	  );

	  // Get current message ID from KV and increment it
	  let currentId = await env.messageId.get("currentId");
	  let messageId = currentId ? parseInt(currentId) + 1 : 1;
	  
	  // Update KV with new message ID
	  await env.messageId.put("currentId", messageId.toString());

	  // Convert the vector embeddings into a format Vectorize can accept
	  let vectors: VectorizeVector[] = [];
	  modelResp.data.forEach((vector) => {
		vectors.push({ 
		  id: `${messageId}`, 
		  values: vector,
		  metadata: {
			memory: userMessage,
			timestamp: new Date().toISOString(),
			type: "user_message"
		  }
		});
	  });

	  // Insert into Vectorize
	  let inserted = await env.VECTORIZE.insert(vectors);
	  console.log("Vectorize insert result:", inserted);
	  console.log("Inserted user message with ID:", messageId);

	} catch (error) {
	  console.error("Error storing user memory:", error);
	  throw error;
	}
  }

  async function getMemoryByChat(env: Env, userQuery: string): Promise<string[]> {
	try {
	  // Generate embeddings for the user query
	  const queryVector: EmbeddingResponse = await env.AI.run(
		"@cf/baai/bge-base-en-v1.5",
		{
		  text: [userQuery],
		},
	  );

	  // Query Vectorize for similar memories
	  let matches = await env.VECTORIZE.query(queryVector.data[0], {
		topK: 3,
		returnValues: true,
		returnMetadata: "all",
	  });

	  // Extract memories from matches
	  const memories: string[] = [];
	  if (matches && matches.matches && matches.matches.length > 0) {
		matches.matches.forEach((match: any) => {
		  if (match.metadata && match.metadata.memory) {
			memories.push(match.metadata.memory);
		  }
		});
	  }

	  console.log("Found memories:", memories);
	  return memories;

	} catch (error) {
	  console.error("Error getting memory by chat:", error);
	  return [];
	}
  }
  
  export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
	  if (path.startsWith("/favicon")) {
		return new Response("", { status: 404 });
	  }
  
  // Memory management endpoints
  if (request.method === "GET" && path === "/api/memory") {
	try {
	  // Get current message ID from KV
	  let currentId = await env.messageId.get("currentId");
	  let messageId = currentId ? parseInt(currentId) : 0;
	  
	  if (messageId === 0) {
		return new Response(JSON.stringify({ 
		  memories: [],
		  count: 0,
		  message: "No memories found"
		}), {
		  headers: { "content-type": "application/json" }
		});
	  }
	  
	  // Get the latest 10 memories by IDs
	  const startId = Math.max(1, messageId - 9); // Get last 10 IDs
	  const ids = Array.from({ length: Math.min(10, messageId) }, (_, i) => (startId + i).toString());
	  
	  const matches = await env.VECTORIZE.getByIds(ids);
	  
	  // Process the memories
	  const memories = [];
	  if (matches && matches.length > 0) {
		matches.forEach((match: any) => {
		  if (match.metadata && match.metadata.memory) {
			const vector = match.values || [];
			const vectorPreview = vector.length > 0 ? 
			  `[${vector[0].toFixed(4)}, ..., ${vector[vector.length - 1].toFixed(4)}]` : 
			  '[]';
			
			memories.push({
			  id: match.id,
			  vector: vectorPreview,
			  message: match.metadata.memory,
			  timestamp: match.metadata.timestamp || 'Unknown'
			});
		  }
		});
	  }
	  
	  // Sort by ID (newest first)
	  memories.sort((a, b) => parseInt(b.id) - parseInt(a.id));
	  
	  return new Response(JSON.stringify({ 
		memories: memories,
		count: memories.length,
		total: messageId
	  }), {
		headers: { "content-type": "application/json" }
	  });
	} catch (error) {
	  console.error("Error getting memory:", error);
	  return new Response(JSON.stringify({ 
		error: `Error getting memory: ${error instanceof Error ? error.message : 'Unknown error'}` 
	  }), {
		status: 500,
		headers: { "content-type": "application/json" }
	  });
	}
  }

  if (request.method === "DELETE" && path === "/api/memory") {
	try {
	  // Get current message ID from KV
	  let currentId = await env.messageId.get("currentId");
	  let messageId = currentId ? parseInt(currentId) : 0;
	  
	  if (messageId === 0) {
		return new Response(JSON.stringify({ 
		  message: "No memories to delete",
		  currentId: messageId
		}), {
		  headers: { "content-type": "application/json" }
		});
	  }
	  
	  // Create array of IDs from 1 to current messageId
	  const idsToDelete = Array.from({ length: messageId }, (_, i) => (i + 1).toString());
	  
	  // Call deleteByIds method
	  const result = await env.VECTORIZE.deleteByIds(idsToDelete);
	  
	  // Reset message ID to 0 in KV
	  await env.messageId.put("currentId", "0");
	  
	  return new Response(JSON.stringify({ 
		message: "Memory deletion completed",
		deletedIds: idsToDelete,
		deletedCount: idsToDelete.length,
		result: result
	  }), {
		headers: { "content-type": "application/json" }
	  });
	} catch (error) {
	  console.error("Error deleting memory:", error);
	  return new Response(JSON.stringify({ 
		error: `Error deleting memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
		details: error
	  }), {
		status: 500,
		headers: { "content-type": "application/json" }
	  });
	}
  }

  // Chat endpoint that uses OpenRouter API
  if (request.method === "POST" && path === "/api/chat") {
	try {
	  const body = await request.json() as { message?: string; text?: string };
	  const userMessage = body.message || body.text || "";
	  
	  if (!userMessage.trim()) {
		return new Response(JSON.stringify({ error: "Message is required" }), {
		  status: 400,
		  headers: { "content-type": "application/json" }
		});
	  }

	  // Get relevant memories from vector database
	  const memories = await getMemoryByChat(env, userMessage);
	  
	  // Build context with memories
	  let contextPrompt = userMessage;
	  if (memories.length > 0) {
		contextPrompt = `This is some chat history that you may take as reference data:\n\n${memories.join('\n\n')}\n\nUser's current question: ${userMessage}`;
	  }
	  console.log(contextPrompt)
	  // Call OpenRouter API with context
	  const messages: OpenRouterMessage[] = [
		{
		  role: "user",
		  content: contextPrompt
		}
	  ];
			
	  const response = await callOpenRouter(env, messages);
			
	  // Store user message as memory
	  try {
		await storeUserMemory(env, userMessage);
		console.log("User message stored as memory");
	  } catch (memoryError) {
		console.error("Error storing user memory:", memoryError);
	  }
	  
	  return new Response(JSON.stringify({ 
		message: response,
		success: true
	  }), {
		headers: { "content-type": "application/json" }
	  });
	} catch (error) {
	  return new Response(JSON.stringify({ error: "Invalid request body" }), {
		status: 400,
		headers: { "content-type": "application/json" }
	  });
	}
  }

	  // Serve a static prototype UI. Future APIs (not implemented here):
	  // - GET /api/history   -> get chat history
	  // - GET /api/memory    -> get memory
		if (request.method === "GET" && path === "/") {
			const html = `<!doctype html>
		<html lang="en">
		<head>
		  <meta charset="utf-8" />
		  <meta name="viewport" content="width=device-width, initial-scale=1" />
		  <title>Chatbot Prototype</title>
		  <style>
			:root {
			  --bg: #0b1020;
			  --card: rgba(255, 255, 255, 0.06);
			  --card-border: rgba(255, 255, 255, 0.12);
			  --text: #e6e9ef;
			  --muted: #9aa3b2;
			  --accent: #7c9cf6;
			  --accent-2: #6ee7f9;
			  --danger: #ff6b6b;
			}

			* { box-sizing: border-box; }
			html, body { height: 100%; }
			body {
			  margin: 0;
			  color: var(--text);
			  background: radial-gradient(1200px 800px at 10% -10%, rgba(124, 156, 246, 0.25), transparent 60%),
						  radial-gradient(900px 700px at 110% 20%, rgba(110, 231, 249, 0.18), transparent 60%),
						  var(--bg);
			  font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, "Apple Color Emoji", "Segoe UI Emoji";
			}

			.container {
			  max-width: 1100px;
			  margin: 0 auto;
			  padding: 16px;
			  display: flex;
			  flex-direction: column;
			  min-height: 100dvh;
			}

			.header {
			  display: flex;
			  align-items: center;
			  justify-content: space-between;
			  gap: 12px;
			  padding: 8px 0 16px 0;
			}

			.brand {
			  display: flex;
			  align-items: center;
			  gap: 10px;
			}
			.logo {
			  width: 36px; height: 36px; border-radius: 10px;
			  background: linear-gradient(135deg, var(--accent), var(--accent-2));
			  box-shadow: 0 8px 30px rgba(124, 156, 246, 0.35);
			}
			.title { font-weight: 700; letter-spacing: 0.2px; }
			.subtitle { color: var(--muted); font-size: 12px; }

			.card {
			  background: var(--card);
			  border: 1px solid var(--card-border);
			  border-radius: 14px;
			  backdrop-filter: blur(8px);
			  -webkit-backdrop-filter: blur(8px);
			  box-shadow: 0 10px 30px rgba(0,0,0,0.25);
			}

			.chat {
			  display: flex;
			  flex-direction: column;
			  min-height: 0; /* allow flex container to size correctly */
			  flex: 1;
			  padding: 14px;
			}

			.messages {
			  display: flex;
			  flex-direction: column;
			  gap: 12px;
			  height: 58dvh;
			  overflow: auto;
			  padding-right: 6px;
			}
			.message {
			  display: grid;
			  grid-template-columns: 36px 1fr;
			  gap: 10px;
			  align-items: start;
			}
			.avatar {
			  width: 36px; height: 36px; border-radius: 50%;
			  background: linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.03));
			  border: 1px solid var(--card-border);
			}
			.bubble {
			  padding: 10px 12px;
			  border-radius: 12px;
			  background: rgba(255,255,255,0.05);
			  border: 1px solid var(--card-border);
			}
			.me .bubble { background: rgba(124, 156, 246, 0.12); border-color: rgba(124, 156, 246, 0.35); }
			.meta { color: var(--muted); font-size: 12px; margin-bottom: 4px; }

			.input-row {
			  display: grid;
			  grid-template-columns: 1fr auto;
			  gap: 10px;
			  margin-top: 12px;
			}
			.input {
			  width: 100%;
			  padding: 12px 14px;
			  border-radius: 12px;
			  color: var(--text);
			  background: rgba(255, 255, 255, 0.06);
			  border: 1px solid var(--card-border);
			  outline: none;
			}
			.input::placeholder { color: #a6b0c2; }
			.button {
			  padding: 10px 14px;
			  border-radius: 12px;
			  border: 1px solid var(--card-border);
			  background: linear-gradient(135deg, rgba(124, 156, 246, 0.2), rgba(110, 231, 249, 0.16));
			  color: var(--text);
			  cursor: pointer;
			}
			.button[data-busy="true"] { background: linear-gradient(135deg, rgba(124, 156, 246, 0.1), rgba(110, 231, 249, 0.08)); opacity: 0.7; }

			.toolbar {
			  position: sticky;
			  bottom: 0;
			  display: grid;
			  grid-template-columns: 1fr 1fr;
			  gap: 10px;
			  padding: 12px 14px;
			  margin-top: 14px;
			}
			.tool {
			  padding: 10px 12px;
			  border-radius: 10px;
			  border: 1px solid var(--card-border);
			  background: rgba(255, 255, 255, 0.06);
			  color: var(--text);
			  text-align: center;
			  cursor: pointer;
			}
			.tool.danger { background: rgba(255, 107, 107, 0.14); border-color: rgba(255, 107, 107, 0.35); }

			/* Modal styles */
			.modal {
			  display: none;
			  position: fixed;
			  z-index: 1000;
			  left: 0;
			  top: 0;
			  width: 100%;
			  height: 100%;
			  background-color: rgba(0, 0, 0, 0.5);
			  backdrop-filter: blur(4px);
			}
			.modal-content {
			  background: var(--card);
			  border: 1px solid var(--card-border);
			  border-radius: 14px;
			  margin: 5% auto;
			  padding: 20px;
			  width: 90%;
			  max-width: 800px;
			  max-height: 80vh;
			  overflow-y: auto;
			  box-shadow: 0 20px 40px rgba(0,0,0,0.3);
			}
			.modal-header {
			  display: flex;
			  justify-content: space-between;
			  align-items: center;
			  margin-bottom: 20px;
			  padding-bottom: 10px;
			  border-bottom: 1px solid var(--card-border);
			}
			.modal-title {
			  font-size: 18px;
			  font-weight: 600;
			  color: var(--text);
			}
			.close {
			  color: var(--muted);
			  font-size: 28px;
			  font-weight: bold;
			  cursor: pointer;
			  line-height: 1;
			}
			.close:hover { color: var(--text); }
			.memory-table {
			  width: 100%;
			  border-collapse: collapse;
			  margin-top: 10px;
			}
			.memory-table th,
			.memory-table td {
			  padding: 12px;
			  text-align: left;
			  border-bottom: 1px solid var(--card-border);
			}
			.memory-table th {
			  background: rgba(255, 255, 255, 0.05);
			  font-weight: 600;
			  color: var(--text);
			}
			.memory-table td {
			  color: var(--muted);
			  font-size: 14px;
			}
			.memory-table tr:hover {
			  background: rgba(255, 255, 255, 0.02);
			}
			.vector-preview {
			  font-family: monospace;
			  font-size: 12px;
			  color: var(--accent);
			}
			.message-cell {
			  max-width: 300px;
			  word-wrap: break-word;
			}

			.footer { color: var(--muted); font-size: 12px; text-align: center; padding: 10px 0 20px 0; }

			/* Responsive tweaks */
			@media (max-width: 680px) {
			  .messages { height: 58dvh; }
			  .header { flex-direction: column; align-items: flex-start; gap: 6px; }
			}
		  </style>
		</head>
		<body>
		  <div class="container">
			<header class="header">
			  <div class="brand">
				<div class="logo"></div>
				<div>
				  <div class="title">Chatbot Prototype</div>
				  <div class="subtitle">Modern, responsive UI — APIs to be wired later</div>
				</div>
			  </div>
			</header>

			<section class="card chat">
			  <div class="messages" id="messages"></div>

			  <div class="input-row">
				<input class="input" id="input" placeholder="Type a message..." />
				<button class="button" id="send">Send</button>
			  </div>

			  <div class="toolbar">
				<button class="tool" id="getMemory" title="GET /api/memory">Get Memory</button>
				<button class="tool danger" id="removeMemory" title="DELETE /api/memory">Remove All Memory</button>
			  </div>
			</section>

			<footer class="footer">Chatbot with Memory — Powered by OpenRouter AI & Cloudflare Vectorize</footer>
		  </div>

		  <!-- Memory Modal -->
		  <div id="memoryModal" class="modal">
			<div class="modal-content">
			  <div class="modal-header">
				<h2 class="modal-title">Memory Database</h2>
				<span class="close">&times;</span>
			  </div>
			  <div id="memoryContent">
				<p>Loading memories...</p>
			  </div>
			</div>
		  </div>
		  <script>
			const messages = document.getElementById('messages');
			const input = document.getElementById('input');
			const sendBtn = document.getElementById('send');
			if (messages) { messages.scrollTop = messages.scrollHeight; }

			function appendMessage({ me, text }) {
			  const wrap = document.createElement('div');
			  wrap.className = 'message' + (me ? ' me' : '');
			  const avatar = document.createElement('div');
			  avatar.className = 'avatar';
			  const bubble = document.createElement('div');
			  bubble.className = 'bubble';
			  const meta = document.createElement('div');
			  meta.className = 'meta';
			  meta.textContent = me ? 'You • just now' : 'Assistant • just now';
			  const body = document.createElement('div');
			  const processedText = (text || '').replace(/\\n\\n\\n\\n/g, '<br/>');
			  body.textContent = processedText;
			  body.style.whiteSpace = 'pre-line';
			  bubble.appendChild(meta);
			  bubble.appendChild(body);
			  wrap.appendChild(avatar);
			  wrap.appendChild(bubble);
			  messages.appendChild(wrap);
			  messages.scrollTop = messages.scrollHeight;
			  return body; // return the content node for streaming updates
			}

			async function sendMessage() {
			  const text = (input.value || '').trim();
			  if (!text) return;
			  // Add user message
			  appendMessage({ me: true, text });
			  input.value = '';
			  // Prepare assistant placeholder
			  const assistantBody = appendMessage({ me: false, text: '' });

			  // Disable input while waiting, but keep button interactive
			  input.disabled = true;
			  sendBtn.setAttribute('data-busy', 'true');

			  try {
				const res = await fetch('/api/chat', { 
				  method: 'POST',
				  headers: {
					'Content-Type': 'application/json'
				  },
				  body: JSON.stringify({ message: text })
				});
				if (!res.ok) throw new Error('Network error');
				
				const result = await res.json();
				if (result.success && result.message) {
				  // Process the message and display it
				  const processedMessage = result.message.replace(/\\n\\n\\n\\n/g, '<br/>');
				  assistantBody.innerHTML = processedMessage;
				  messages.scrollTop = messages.scrollHeight;
				} else {
				  assistantBody.textContent = 'Error: ' + (result.error || 'Unknown error');
				}
			  } catch (err) {
				assistantBody.textContent = '[Error receiving response]';
			  } finally {
				input.disabled = false;
				sendBtn.removeAttribute('data-busy');
				input.focus();
			  }
			}

			sendBtn.addEventListener('click', sendMessage);
			input.addEventListener('keydown', (e) => {
			  if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				sendMessage();
			  }
			});

			// Get Memory button handler
			const getMemoryBtn = document.getElementById('getMemory');
			const memoryModal = document.getElementById('memoryModal');
			const memoryContent = document.getElementById('memoryContent');
			const closeBtn = document.querySelector('.close');
			
			if (getMemoryBtn) {
			  getMemoryBtn.addEventListener('click', async () => {
				try {
				  memoryContent.innerHTML = '<p>Loading memories...</p>';
				  memoryModal.style.display = 'block';
				  
				  const response = await fetch('/api/memory', { method: 'GET' });
				  const result = await response.json();
				  
				  if (result.memories && result.memories.length > 0) {
					// Create table HTML
					let tableHTML = '<p>Found ' + result.count + ' memories (showing latest 10)</p>' +
					  '<table class="memory-table">' +
						'<thead>' +
						  '<tr>' +
							'<th>ID</th>' +
							'<th>Vector Preview</th>' +
							'<th>Original Message</th>' +
							'<th>Timestamp</th>' +
						  '</tr>' +
						'</thead>' +
						'<tbody>';
					
					result.memories.forEach(memory => {
					  tableHTML += '<tr>' +
						'<td>' + memory.id + '</td>' +
						'<td><span class="vector-preview">' + memory.vector + '</span></td>' +
						'<td class="message-cell">' + memory.message + '</td>' +
						'<td>' + new Date(memory.timestamp).toLocaleString() + '</td>' +
					  '</tr>';
					});
					
					tableHTML += '</tbody></table>';
					memoryContent.innerHTML = tableHTML;
				  } else {
					memoryContent.innerHTML = '<p>No memories found. Start chatting to create memories!</p>';
				  }
				} catch (error) {
				  console.error('Error calling get memory:', error);
				  memoryContent.innerHTML = '<p>Error loading memories. Please try again.</p>';
				}
			  });
			}
			
			// Close modal handlers
			if (closeBtn) {
			  closeBtn.addEventListener('click', () => {
				memoryModal.style.display = 'none';
			  });
			}
			
			// Close modal when clicking outside
			window.addEventListener('click', (event) => {
			  if (event.target === memoryModal) {
				memoryModal.style.display = 'none';
			  }
			});


			// Remove Memory button handler
			const removeMemoryBtn = document.getElementById('removeMemory');
			if (removeMemoryBtn) {
			  removeMemoryBtn.addEventListener('click', async () => {
				try {
				  const response = await fetch('/api/memory', { method: 'DELETE' });
				  const result = await response.json();
				  console.log('Memory deletion response:', result);
				  alert('Memory deletion completed - check console for details');
				} catch (error) {
				  console.error('Error calling memory deletion:', error);
				}
			  });
			}
		  </script>
		</body>
		</html>`;
			return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
		}

		return new Response("Not found", { status: 404 });
	},
  } satisfies ExportedHandler<Env>;