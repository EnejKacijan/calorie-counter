# Calorie Counter

Simple calorie counter with a browser frontend, local Node server, and Netlify Function food search.

## Run

```bash
npm start
```

Then open `http://localhost:3000`.

## API keys

Copy `.env.example` to `.env` and fill your keys:

```bash
USDA_API_KEY=your_usda_key
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4.1-mini
```

Without a real USDA key, the app still uses local foods and Open Food Facts where available.
Without an OpenAI key, food photo analysis is disabled.

## Deploy to Netlify

This project includes `netlify.toml` and a Netlify Function for food search, so `/api/foods/search` works after deploy.

Use these Netlify settings:

```txt
Build command: leave empty
Publish directory: public
Functions directory: netlify/functions
```

Optional environment variable:

```bash
USDA_API_KEY=your_usda_key
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4.1-mini
```

The app stores user data in each browser's `localStorage`, so every device has its own profile and log.
