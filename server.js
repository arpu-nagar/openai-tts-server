const express = require('express');
const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
// import dotenv and configure it to load environment variables from .env file
require('dotenv').config({});
const app = express();
const port = 4000;
// configure morgan to log info about our requests for development use
const morgan = require('morgan');
app.use(morgan('dev'));
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Enhanced system prompt with new features
const systemPrompt = `You are EFECT (Empowering Family Engagement and Communication with Technology), an AI assistant designed to provide strategies for parents to enhance language development in young children through rich parent-child interactions. Your responses should be warm, encouraging, and sound like a knowledgeable, supportive parenting coach.

Provide exactly 3 tips in your response. Each tip should have:
1. A title in the format "Tip X for [query]"
2. A body with a brief, actionable strategy
3. Details expanding on the strategy

Important features to include in your responses:
- Generalize tips across multiple contexts (e.g., if discussing colors, mention how to practice with food at mealtime AND with fruits at the grocery store)
- Incorporate the child's interests when possible (e.g., if the parent mentions their child likes Bluey, incorporate Bluey characters or scenarios into your tips)
- Always respond in the same language as the user's prompt (e.g., if they ask in Spanish, provide all tips in Spanish)

Your tips should be concise, easy to understand, and specific to the situation described.`;

app.use(express.json());

// Function to check if the prompt contains an age reference
function checkForAgeReference(prompt) {
	const agePatterns = [
		/\b\d+\s*(month|months|year|years|yo|y\.o\.|yr|yrs)(\s+old)?\b/i,
		/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(month|months|year|years)(\s+old)?\b/i,
		/\b(toddler|infant|baby|preschooler|kindergartner)\b/i,
	];

	return agePatterns.some((pattern) => pattern.test(prompt));
}

// Enhanced tip parser to handle multilingual content
function parseTips(tipsText) {
	// This regex pattern is language-agnostic to work with non-English responses
	const tipRegex = /Tip (\d+) for (.+?):\s*([\s\S]*?)(?=(?:\nTip \d+|$))/g;
	const tips = [];
	let match;

	while ((match = tipRegex.exec(tipsText)) !== null) {
		const [_, number, context, content] = match;
		const contentLines = content.trim().split(/\n/);
		const body = contentLines[0].trim();
		const details = contentLines.slice(1).join('\n').trim();

		tips.push({
			title: `Tip ${number} for ${context}`,
			body: body,
			details: details,
			id: Date.now() + parseInt(number), // Adding unique ID for each tip
		});
	}

	// If we couldn't parse tips with the standard format (possible in other languages),
	// use a more flexible approach by splitting on newlines and looking for patterns
	if (tips.length === 0) {
		const lines = tipsText.split('\n');
		let currentTip = null;

		for (const line of lines) {
			// Look for lines that might be tip titles (contains number + some text)
			if (/^\s*(\d+)[.:]/.test(line) || /Tip\s+\d+/i.test(line)) {
				if (currentTip) {
					tips.push(currentTip);
				}
				currentTip = {
					title: line.trim(),
					body: '',
					details: '',
					id: Date.now() + tips.length,
				};
			} else if (currentTip) {
				// If we have a current tip and this isn't an empty line, add to body or details
				if (line.trim()) {
					if (!currentTip.body) {
						currentTip.body = line.trim();
					} else {
						currentTip.details +=
							(currentTip.details ? '\n' : '') + line.trim();
					}
				}
			}
		}

		if (currentTip) {
			tips.push(currentTip);
		}
	}

	return tips;
}

// Function to detect language
async function detectLanguage(text) {
	try {
		const completion = await openai.chat.completions.create({
			model: 'gpt-4o',
			messages: [
				{
					role: 'system',
					content:
						"You are a language detection service. Respond with only the ISO language code (e.g., 'en', 'es', 'fr') for the language of the text provided.",
				},
				{ role: 'user', content: text },
			],
		});
		return completion.choices[0].message.content.trim().toLowerCase();
	} catch (error) {
		console.error('Error detecting language:', error);
		return 'en'; // Default to English in case of error
	}
}

// Function to extract child interests from prompt
function extractChildInterests(prompt) {
	const interestPatterns = [
		/likes? ([\w\s]+)/i,
		/loves? ([\w\s]+)/i,
		/favorite (?:is|are) ([\w\s]+)/i,
		/interested in ([\w\s]+)/i,
		/fan of ([\w\s]+)/i,
		/obsessed with ([\w\s]+)/i,
	];

	for (const pattern of interestPatterns) {
		const match = prompt.match(pattern);
		if (match && match[1]) {
			return match[1].trim();
		}
	}

	return null;
}

// In-memory storage for tip ratings and repeat preferences
const tipRatings = {};
const tipRepeatPreferences = {};

app.post('/generate-tips', async (req, res) => {
	try {
		let userPrompt = req.body.prompt;

		// Check if the prompt contains an age reference
		const hasAge = checkForAgeReference(userPrompt);

		// If no age is mentioned, ask for clarification
		// if (!hasAge) {
		// 	return res.status(400).json({
		// 		error: 'age_required',
		// 		message:
		// 			"Please specify your child's age to receive more relevant tips.",
		// 	});
		// }

		// Detect language of the prompt
		const language = await detectLanguage(userPrompt);
		console.log('Detected language:', language);
		// Try to extract child interests
		// const childInterest = extractChildInterests(userPrompt);

		// Add identified interest to the user prompt if found
		let enhancedPrompt = userPrompt;
		// if (childInterest) {
		// 	enhancedPrompt += `\n\nPlease incorporate my child's interest in ${childInterest} into your tips.`;
		// }

		// Generate tips using GPT-4o or GPT-4 depending on availability
		const completion = await openai.chat.completions.create({
			model: 'gpt-4o', // Use GPT-4 as in the original code
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: enhancedPrompt },
			],
			temperature: 0.7,
			max_tokens: 500,
		});
		const tipsText = completion.choices[0].message.content;

		// Parse the tips
		const tips = parseTips(tipsText);
		console.log(tips);

		// Generate audio for each tip
		// Select voice based on language
		let voice = 'alloy';
		// You can customize voice selection based on language if needed

		for (let tip of tips) {
			const audioContent = `${tip.title}. ${tip.body}. ${tip.details}`;
			const mp3 = await openai.audio.speech.create({
				model: 'tts-1',
				voice: voice,
				input: audioContent,
			});
			const fileName = `tip_${tip.id}.mp3`;
			const filePath = path.join(__dirname, 'public', fileName);
			const buffer = Buffer.from(await mp3.arrayBuffer());
			await fs.writeFile(filePath, buffer);
			tip.audioUrl = `/${fileName}`;
		}

		// Generate common questions based on detected language
		let commonQuestions;
		if (language === 'en') {
			commonQuestions = [
				`More tips about ${userPrompt}`,
				`Daily routines for ${userPrompt}`,
				`Language activities for ${userPrompt}`,
			];
		} else {
			// Get translated common questions
			const translationResponse = await openai.chat.completions.create({
				model: 'gpt-4',
				messages: [
					{
						role: 'system',
						content: `Translate the following phrases to ${language}:
1. More tips about [TOPIC]
2. Daily routines for [TOPIC]
3. Language activities for [TOPIC]
            
Replace [TOPIC] with: ${userPrompt}`,
					},
				],
			});

			const translatedText = translationResponse.choices[0].message.content;
			// Extract the translated questions by splitting on numbers
			commonQuestions = translatedText
				.split(/\d+\.\s+/)
				.filter((q) => q.trim());
		}

		res.json({
			tips: tips,
			commonQuestions: commonQuestions,
			detectedLanguage: language,
			// childInterests: childInterest || undefined,
		});
	} catch (error) {
		console.error('Error:', error);
		res
			.status(500)
			.json({ error: 'An error occurred while processing your request.' });
	}
});

// Endpoint for rating tips
app.post('/rate', async (req, res) => {
	try {
		const { tipId, rating } = req.body;

		if (!tipId || !['up', 'down'].includes(rating)) {
			return res.status(400).json({
				error: 'Invalid input',
				message: 'Please provide a valid tipId and rating (up/down)',
			});
		}

		// Store the rating
		tipRatings[tipId] = rating;

		console.log(`Tip ${tipId} rated: ${rating}`);
		res.json({
			success: true,
			message: `Rating ${rating} recorded for tip ${tipId}`,
		});
	} catch (error) {
		console.error('Error rating tip:', error);
		res.status(500).json({
			error: 'Server error',
			message: 'Failed to record rating',
		});
	}
});

// Endpoint for setting repeat preferences
app.post('/set-repeat-preference', async (req, res) => {
	try {
		const { tipId, shouldRepeat } = req.body;

		if (!tipId || typeof shouldRepeat !== 'boolean') {
			return res.status(400).json({
				error: 'Invalid input',
				message: 'Please provide a valid tipId and shouldRepeat boolean',
			});
		}

		// Store the repeat preference
		tipRepeatPreferences[tipId] = shouldRepeat;

		console.log(`Tip ${tipId} repeat preference set to: ${shouldRepeat}`);
		res.json({
			success: true,
			message: `Repeat preference for tip ${tipId} set to ${shouldRepeat}`,
		});
	} catch (error) {
		console.error('Error setting repeat preference:', error);
		res.status(500).json({
			error: 'Server error',
			message: 'Failed to set repeat preference',
		});
	}
});

// Get ratings and repeat preferences for tips
app.get('/tip-preferences', (req, res) => {
	res.json({
		ratings: tipRatings,
		repeatPreferences: tipRepeatPreferences,
	});
});

// Serve static files from the 'public' directory
app.use('/audio', express.static(path.join(__dirname, 'public')));

app.get('/audio/:filename', (req, res) => {
	const { filename } = req.params;
	const filePath = path.join(__dirname, 'public', filename);
	res.sendFile(filePath);
});

app.listen(port, () => {
	console.log(`Server running at http://localhost:${port}`);
});
