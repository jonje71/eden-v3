import 'dotenv/config';

async function testConnection() {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  console.log('Sending direct HTTP connection request to Google AI Studio...');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hello EDEN v3! Confirming system connection.' }] }]
      })
    });

    const data = await response.json();
    
    if (data.candidates && data.candidates[0].content) {
      console.log('AI Response:', data.candidates[0].content.parts[0].text);
    } else {
      console.error('API Error Response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('Connection Error:', error);
  }
}

testConnection();