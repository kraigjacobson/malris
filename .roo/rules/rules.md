nuxtui3. we can update the style of components globally in the app.config file or we can style specific components using :ui property like this
{ overlay?: ClassNameValue; content?: ClassNameValue; header?: ClassNameValue; wrapper?: ClassNameValue; body?: ClassNameValue; footer?: ClassNameValue; title?: ClassNameValue; description?: ClassNameValue; close?: ClassNameValue; }
you can run this to see the currently up to date media server api routes: curl -X GET "http://localhost:8000/openapi.json"
ssr server side rendering is false.
you can check the media server logs using this: docker logs comfy-media-app
never use the browser