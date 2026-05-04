/**
 * Swagger UI HTML shell. Loads JS/CSS from the unpkg CDN — acceptable
 * because `/docs` is local-dev only (gated by `OPENAPI_ENABLED`).
 *
 * The "Authorize" button appears automatically when the spec declares
 * `components.securitySchemes` (see `gateway-spec.ts`), letting users paste
 * an API key for "Try it out" calls against `/api/v1/*`.
 */

const SWAGGER_VERSION = '5.17.14';

export function swaggerUiHtml(specUrl: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>flow-punk API reference</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css" />
    <style>
      body { margin: 0; }
      .swagger-ui .topbar { display: none; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.addEventListener('load', () => {
        window.ui = SwaggerUIBundle({
          url: ${JSON.stringify(specUrl)},
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis],
          layout: 'BaseLayout',
          persistAuthorization: true,
        });
      });
    </script>
  </body>
</html>
`;
}
