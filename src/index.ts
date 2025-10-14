export interface Env {
	VECTORIZE: Vectorize;
	AI: Ai;
  }
  interface EmbeddingResponse {
	shape: number[];
	data: number[][];
  }
  
  export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
	  if (path.startsWith("/favicon")) {
		return new Response("", { status: 404 });
	  }
  
	  // Minimal SSE chat endpoint (POST) that streams a fake response
	  if (request.method === "POST" && path === "/api/chat") {
		const encoder = new TextEncoder();
		const stream = new ReadableStream<Uint8Array>({
		  start(controller) {
			// Simple tokenized fake reply
			const tokens = [
			  "Thanks ",
			  "for ",
			  "your ",
			  "message! ",
			  "This ",
			  "is ",
			  "a ",
			  "streamed ",
			  "response ",
			  "using ",
			  "SSE."
			];
			let i = 0;
			const interval = setInterval(() => {
			  if (i < tokens.length) {
				const chunk = `data: ${tokens[i++]}\n\n`;
				controller.enqueue(encoder.encode(chunk));
			  } else {
				clearInterval(interval);
				controller.enqueue(encoder.encode("event: done\ndata: [DONE]\n\n"));
				controller.close();
			  }
			}, 150);
		  }
		});
		return new Response(stream, {
		  headers: {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-cache",
			"connection": "keep-alive",
		  },
		});
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
			.button .label-stop { display: none; }
			.button[data-busy="true"] { background: linear-gradient(135deg, rgba(255, 107, 107, 0.25), rgba(255, 160, 122, 0.18)); border-color: rgba(255, 107, 107, 0.35); }
			/* Only show Stop label when busy AND hovered */
			.button[data-busy="true"]:hover .label-send { display: none; }
			.button[data-busy="true"]:hover .label-stop { display: inline; }

			.toolbar {
			  position: sticky;
			  bottom: 0;
			  display: grid;
			  grid-template-columns: repeat(4, 1fr);
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
			  cursor: not-allowed; /* placeholder - no events wired */
			}
			.tool.danger { background: rgba(255, 107, 107, 0.14); border-color: rgba(255, 107, 107, 0.35); }

			.footer { color: var(--muted); font-size: 12px; text-align: center; padding: 10px 0 20px 0; }

			/* Responsive tweaks */
			@media (max-width: 680px) {
			  .messages { height: 58dvh; }
			  .header { flex-direction: column; align-items: flex-start; gap: 6px; }
			  .toolbar { grid-template-columns: 1fr 1fr; }
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
				<button class="button" id="send"><span class="label-send">Send</span><span class="label-stop">Stop</span></button>
			  </div>

			  <div class="toolbar">
				<button class="tool" aria-disabled="true" title="GET /api/history">Get Chat History</button>
				<button class="tool" aria-disabled="true" title="GET /api/memory">Get Memory</button>
			  </div>
			</section>

			<footer class="footer">Prototype UI — endpoints pending: /api/history, /api/memory</footer>
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
			  body.textContent = text || '';
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
				const res = await fetch('/api/chat', { method: 'POST' });
				if (!res.ok || !res.body) throw new Error('Network error');
				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = '';
				while (true) {
				  const { value, done } = await reader.read();
				  if (done) break;
				  buffer += decoder.decode(value, { stream: true });
				  let parts = buffer.split('\\n\\n');
				  buffer = parts.pop() || '';
				  for (const part of parts) {
					const lines = part.split('\\n');
					let eventName = null;
					let dataLines = [];
					for (const line of lines) {
					  if (line.startsWith('event:')) eventName = line.slice(6).trim();
					  if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
					}
					const data = dataLines.join('\\n');
					if (eventName === 'done' || data === '[DONE]') {
					  break;
					}
					if (data) {
					  assistantBody.textContent += data;
					  messages.scrollTop = messages.scrollHeight;
					}
				  }
				}
			  } catch (err) {
				assistantBody.textContent = '[Error receiving response]';
			  } finally {
				input.disabled = false;
				sendBtn.removeAttribute('data-busy');
				input.focus();
			  }
			}

			sendBtn.addEventListener('click', (e) => {
			  if (sendBtn.getAttribute('data-busy') === 'true') {
				// Busy state: ignore clicks (hover shows Stop label only)
				return;
			  }
			  sendMessage();
			});
			input.addEventListener('keydown', (e) => {
			  if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				sendMessage();
			  }
			});
		  </script>
		</body>
		</html>`;
			return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
		}

		return new Response("Not found", { status: 404 });
	},
  } satisfies ExportedHandler<Env>;