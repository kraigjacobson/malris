nuxtui3. we can update the style of components globally in the app.config file or we can style specific components using :ui property like this
{ overlay?: ClassNameValue; content?: ClassNameValue; header?: ClassNameValue; wrapper?: ClassNameValue; body?: ClassNameValue; footer?: ClassNameValue; title?: ClassNameValue; description?: ClassNameValue; close?: ClassNameValue; }

things to know:
- **Nuxt Backend API** (malris-nuxt-app container on port 42069): Nuxt server API routes at `/api/*`
- Check running containers: docker ps
- Nuxt app API routes: Available at `/api/*` when accessing the Nuxt app (port 42069), running locally should be port 3000
- Check malris logs - docker logs malris-nuxt-app --tail=50
- Check runpod comfyui logs - docker logs comfyui-runpod-worker --tail=50 - this container has lots of logs. might need to tail lots of lines and grep for errors when debugging.
- database container is called comfy-media-db, check .env for credentials to check records etc...
-- example command to check the local database `docker exec -it comfy-media-db psql -U comfy_user -d comfy_media -c "SELECT id, status, output_uuid FROM jobs WHERE id = '9ca1e10b-f797-4067-9811-885d1dedb93a';"`
we manage the containers using this file X:\repos\comfy-docker\docker-compose.yml
command to rebuild and restart the malris container: cd /x/repos/comfy-docker && docker-compose down malris-app && docker-compose up -d --build malris-app
ssr server side rendering is false.
never use the browser

run all commands with bash because that's the terminal we use, not windows.
