# Calorie Counter

Simple calorie counter with a separate Node backend and browser frontend.

## Run

```bash
npm start
```

Then open `http://localhost:3000`.

## API key

Copy `.env.example` to `.env` and fill your USDA key when you want real food search:

```bash
USDA_API_KEY=your_usda_key
```

Without a real USDA key, the app still uses local foods and Open Food Facts where available.
