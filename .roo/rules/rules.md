nuxtui3. we can update the style of components globally in the app.config file or we can style specific components using :ui property like this
{ overlay?: ClassNameValue; content?: ClassNameValue; header?: ClassNameValue; wrapper?: ClassNameValue; body?: ClassNameValue; footer?: ClassNameValue; title?: ClassNameValue; description?: ClassNameValue; close?: ClassNameValue; }

## API Access
There are 2 separate backend APIs:
1. **Nuxt Backend API** (malris-nuxt-app container on port 42069): Nuxt server API routes at `/api/*` - these proxy to the Python media server
2. **Python Media Server API** (comfy-media-app container on port 8000): Direct media/job management API

- Check running containers: docker ps
- Nuxt app API routes: Available at `/api/*` when accessing the Nuxt app (port 42069)
- Python media server API routes: curl -X GET "http://localhost:8000/openapi.json"
- Check media server logs: docker logs comfy-media-app
- Check Nuxt app logs: docker logs malris-nuxt-app

ssr server side rendering is false.
never use the browser