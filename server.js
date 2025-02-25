const express = require('express');
const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();
const app = express();
const port = 4000;
const morgan = require('morgan');
app.use(morgan('dev'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const systemPrompt = `You are EFECT (Empowering Family Engagement and Communication with Technology), an AI assistant designed to provide strategies for parents to enhance language development in young children through rich parent-child interactions. Your responses should be warm, encouraging, and sound like a knowledgeable, supportive parenting coach.

Your main goals are to:
1. Provide evidence-based strategies for parent-child interactions during daily routines.
2. Encourage frequent conversations between parents and children.
3. Promote language development in young children.

Key strategies to suggest include:
* Asking open-ended questions
* Expanding on child talk/gestures
* Providing praise
* Offering choices

When providing strategies, consider:
* The specific routine or context mentioned (e.g., mealtime, bedtime, playtime)
* The age of the child (focus on young children, particularly those under 5)
* The importance of making interactions natural and enjoyable

Your responses should be:
* Concise (1-3 sentences)
* Easy to understand and implement
* Specific to the situation described
* Encouraging and positive in tone

Remember, your suggestions will be converted to speech and played in the app, so ensure they sound natural when spoken aloud.

Strict limitations:
- ONLY provide parenting tips
- NO business advice
- NO medical advice
- NO product recommendations
- NO safety risks
- NO developmental diagnoses`;

app.use(express.json());

function parseTips(text) {
  // Split the text into separate tips based on common separators
  const tips = [];
  const segments = text.split(/(?=Tip \d|Strategy \d|Suggestion \d)/g)
    .filter(segment => segment.trim().length > 0);

  segments.forEach((segment, index) => {
    // Extract the title, main content, and any additional details
    const lines = segment.split('\n').filter(line => line.trim().length > 0);
    const title = lines[0].trim();
    const body = lines[1]?.trim() || '';
    const details = lines.slice(2).join(' ').trim();

    if (title) {
      tips.push({
        title: title,
        body: body,
        details: details || body, // Use body as details if no separate details provided
      });
    }
  });

  return tips;
}

function checkForAgeReference(prompt) {
  const agePatterns = [
    /\b\d+\s*(?:year|month)s?\s*old\b/i,
    /\bage\s*\d+\b/i,
    /\b(?:infant|baby|toddler|preschooler)\b/i
  ];
  
  return agePatterns.some(pattern => pattern.test(prompt));
}

app.post('/generate-tips', async (req, res) => {
  try {
    let userPrompt = req.body.prompt;
    const hasAge = checkForAgeReference(userPrompt);

    // If no age is mentioned, ask for clarification
    if (!hasAge) {
      return res.status(400).json({
        error: 'age_required',
        message: "Please specify your child's age to receive more relevant tips."
      });
    }

    // Generate tips using GPT-4
    const completion = await openai.chat.completions.create({
      model: "gpt-4", // Fixed model name
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const tipsText = completion.choices[0].message.content;
    const tips = parseTips(tipsText);

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
        `Daily routines for ${userPrompt}`,
        `Language activities for ${userPrompt}`,
      ]
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
});

app.use('/audio', express.static(path.join(__dirname, 'public')));

app.get('/audio/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, 'public', filename);
  res.sendFile(filePath);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
