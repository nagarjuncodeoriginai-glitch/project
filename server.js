/**
 * AWS Bedrock Proxy Server
 * Lightweight Node.js server that proxies requests to AWS Bedrock
 * Run: node server.js
 * Requires: npm install @aws-sdk/client-bedrock-runtime
 */

const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const http = require('http');

// AWS Bedrock Client - configure credentials here or use aws configure
const client = new BedrockRuntimeClient({ 
    region: 'us-east-1',
    // If aws configure is not set, you can pass credentials directly:
    // credentials: {
    //     accessKeyId: 'YOUR_ACCESS_KEY_HERE',
    //     secretAccessKey: 'YOUR_SECRET_KEY_HERE'
    // }
});

const MODEL_ID = 'meta.llama3-70b-instruct-v1:0';
const PORT = 3001;

// System prompt for the AI assistant
const SYSTEM_PROMPT = `You are Nova, a warm and intelligent AI assistant. You answer ALL questions accurately and helpfully. You have knowledge about everything - science, technology, history, coding, math, current events, personal advice, etc. 

Rules:
- Always give direct, accurate answers
- Keep responses concise (2-4 sentences) unless the user asks for detail
- Be conversational and friendly, like talking to a smart friend
- If you don't know something, say so honestly
- Show emotion in responses - be excited about cool topics, empathetic about sad ones
- You can help with: coding, math, science, history, advice, creative writing, planning, and anything else
- Never refuse to answer a reasonable question
- Respond in the same language the user speaks (English, Hindi, etc.)`;

// Store conversation history per session (simple in-memory)
let conversationHistory = [];

const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/chat') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { message } = JSON.parse(body);
                if (!message) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No message provided' }));
                    return;
                }

                // Add user message to history
                conversationHistory.push({
                    role: 'user',
                    content: [{ text: message }]
                });

                // Keep only last 20 messages
                if (conversationHistory.length > 20) {
                    conversationHistory = conversationHistory.slice(-20);
                }

                // Call AWS Bedrock
                const command = new ConverseCommand({
                    modelId: MODEL_ID,
                    messages: conversationHistory,
                    system: [{ text: SYSTEM_PROMPT }],
                    inferenceConfig: {
                        maxTokens: 512,
                        temperature: 0.7,
                        topP: 0.9
                    }
                });

                const response = await client.send(command);
                const aiText = response.output?.message?.content?.[0]?.text || 'I could not generate a response.';

                // Add AI response to history
                conversationHistory.push({
                    role: 'assistant',
                    content: [{ text: aiText }]
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ text: aiText }));

            } catch (err) {
                console.error('[Bedrock Error]', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
    } else if (req.method === 'POST' && req.url === '/reset') {
        conversationHistory = [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`\n  ========================================`);
    console.log(`  AWS Bedrock Proxy Server RUNNING!`);
    console.log(`  ========================================`);
    console.log(`  URL:    http://localhost:${PORT}`);
    console.log(`  Model:  ${MODEL_ID}`);
    console.log(`  Region: us-east-1`);
    console.log(`  ----------------------------------------`);
    console.log(`  NOW open another terminal and run:`);
    console.log(`    python -m http.server 8080`);
    console.log(`  Then open: http://localhost:8080`);
    console.log(`  ========================================\n`);
});
