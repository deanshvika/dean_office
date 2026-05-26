const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function parse() {
    const text = "גילי מבקשת החלפה ב-29/05 ביוחנני הרצליה, סיבה חופשה, אין מחליף עדיין";
    const year = new Date().getFullYear();

    const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
            role: 'user',
            content: `חלץ פרטי חילוף מהטקסט הבא. החזר JSON בלבד:
{"requestingCoach":"","date":"DD/MM/YYYY","location":"","reason":"","replacementCoach":"","paymentDetails":"","notes":""}

טקסט: "${text}"`
        }]
    });

    const raw = msg.content[0].text.replace(/```json\n?|\n?```/g, '').trim();
    const data = JSON.parse(raw);

    console.log(JSON.stringify(data, null, 2));
}

parse().catch(console.error);
