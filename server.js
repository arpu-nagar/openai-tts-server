const express = require('express');
const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
// import dotenv and configure it to load environment variables from .env file

require('dotenv').config({});
const app = express();
const port = 1337;
// configure morgan to log info about our requests for development use
const morgan = require('morgan');
app.use(morgan('dev'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const systemPrompt = `You are EFECT (Empowering Family Engagement and Communication with Technology), an AI assistant designed to provide strategies for parents to enhance language development in young children through rich parent-child interactions. Your responses should be warm, encouraging, and sound like a knowledgeable, supportive parenting coach.

Provide exactly 3 tips in your response. Each tip should have:
1. A title in the format "Tip X for [query]"
2. A body with a brief, actionable strategy
3. Details expanding on the strategy

Your tips should be concise, easy to understand, and specific to the situation described.`;

app.use(express.json());

function parseTips(tipsText) {
  const tipRegex = /Tip (\d+) for (.+?):\s*([\s\S]*?)(?=(?:\nTip \d+|$))/g;
  const tips = [];
  let match;

  while ((match = tipRegex.exec(tipsText)) !== null) {
    const [_, number, context, content] = match;
    const [body, ...detailsParts] = content.trim().split(/\n/);

    tips.push({
      title: `Tip ${number} for ${context}`,
      body: body.trim(),
      details: detailsParts.join('\n').trim(),
    });
  }

  return tips;
}


app.post('/generate-tips', async (req, res) => {
  try {
    const userPrompt = req.body.prompt;

    // Generate tips using GPT-3.5-turbo
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
    });

    const tipsText = completion.choices[0].message.content;
    
    // Parse the tips
    const tips = parseTips(tipsText);
    console.log(tips);
    // Generate audio for each tip
    for (let tip of tips) {
      const audioContent = `${tip.title}. ${tip.body}. ${tip.details}`;
      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy",
        input: audioContent,
      });

      const fileName = `tip_${Date.now()}.mp3`;
      const filePath = path.join(__dirname, 'public', fileName);
      const buffer = Buffer.from(await mp3.arrayBuffer());
      await fs.writeFile(filePath, buffer);

      tip.audioUrl = `/${fileName}`;
    }

    res.json({ 
      tips: tips,
      commonQuestions: [
        `More tips about ${userPrompt}`,
        `How to handle ${userPrompt} with toddlers`,
        `Expert advice on ${userPrompt}`,
      ]
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
});


// Serve static files from the 'public' directory
app.use('/audio', express.static(path.join(__dirname, 'public')));
// 
app.get('/audio/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, 'public', filename);
  res.sendFile(filePath);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});