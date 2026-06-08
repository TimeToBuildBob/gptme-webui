#!/usr/bin/env python3
"""Simple HTTP server with SPA routing and dev deploy support.

Serves static files and falls back to index.html for all other routes,
enabling proper single-page application routing.
"""

import http.server
import json
import os
import socketserver
import urllib.error
import urllib.parse
import urllib.request


TRUTHY_VALUES = {"1", "true", "yes", "on"}


def _env_truthy(name):
    return os.environ.get(name, "").strip().lower() in TRUTHY_VALUES


def _get_deploy_config():
    """Return deploy trigger config without exposing the GitHub token."""
    repository = os.environ.get("GPTME_WEBUI_DEPLOY_REPOSITORY", "gptme/gptme-webui")
    workflow = os.environ.get("GPTME_WEBUI_DEPLOY_WORKFLOW", "deploy.yml")
    ref = os.environ.get("GPTME_WEBUI_DEPLOY_REF", "master")
    token = os.environ.get("GPTME_WEBUI_GITHUB_TOKEN") or os.environ.get("GITHUB_TOKEN")
    enabled = _env_truthy("GPTME_WEBUI_ENABLE_DEV_DEPLOY")

    return {
        "enabled": enabled,
        "configured": enabled and bool(token) and "/" in repository and bool(workflow) and bool(ref),
        "repository": repository,
        "workflow": workflow,
        "ref": ref,
        "has_token": bool(token),
        "actions_url": f"https://github.com/{repository}/actions/workflows/{workflow}",
    }


def _get_workflow_inputs():
    raw_inputs = os.environ.get("GPTME_WEBUI_DEPLOY_INPUTS_JSON")
    if not raw_inputs:
        return None

    try:
        inputs = json.loads(raw_inputs)
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid GPTME_WEBUI_DEPLOY_INPUTS_JSON: {error}") from error

    if not isinstance(inputs, dict):
        raise ValueError("GPTME_WEBUI_DEPLOY_INPUTS_JSON must be a JSON object")

    return inputs


class SPAHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP request handler with SPA routing support."""

    def do_GET(self):
        """Handle GET requests with SPA fallback."""
        request_path = urllib.parse.urlparse(self.path).path

        if request_path == "/api/dev/deploy-staging":
            return self._send_json(200, _get_deploy_config())

        # Get the requested path
        path = self.translate_path(request_path)

        # If path is a directory, try index.html
        if os.path.isdir(path):
            index_path = os.path.join(path, "index.html")
            if os.path.exists(index_path):
                path = index_path

        # If file doesn't exist and it's not an asset, serve index.html
        if not os.path.exists(path):
            # Check if this looks like an asset request
            is_asset = any(
                request_path.endswith(ext)
                for ext in [
                    ".js",
                    ".css",
                    ".png",
                    ".jpg",
                    ".svg",
                    ".ico",
                    ".woff",
                    ".woff2",
                    ".ttf",
                    ".eot",
                    ".otf",
                    ".json",
                    ".webp",
                    ".gif",
                ]
            )

            if not is_asset:
                # Serve index.html for SPA routes
                self.path = "/index.html"

        # Call parent handler
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self):
        """Handle API POST requests."""
        request_path = urllib.parse.urlparse(self.path).path

        if request_path == "/api/dev/deploy-staging":
            return self._trigger_staging_deploy()

        return self._send_json(404, {"error": "Not found"})

    def _send_json(self, status_code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _trigger_staging_deploy(self):
        config = _get_deploy_config()

        if not config["enabled"]:
            return self._send_json(
                403,
                {
                    "error": "Dev deploy trigger is disabled",
                    "detail": "Set GPTME_WEBUI_ENABLE_DEV_DEPLOY=true on the web UI server.",
                },
            )

        token = os.environ.get("GPTME_WEBUI_GITHUB_TOKEN") or os.environ.get("GITHUB_TOKEN")
        if not token:
            return self._send_json(
                503,
                {
                    "error": "Dev deploy trigger is not configured",
                    "detail": "Set GPTME_WEBUI_GITHUB_TOKEN with Actions workflow permissions.",
                },
            )

        if "/" not in config["repository"]:
            return self._send_json(
                500,
                {
                    "error": "Invalid GPTME_WEBUI_DEPLOY_REPOSITORY",
                    "detail": "Expected owner/repo format.",
                },
            )

        try:
            payload = {"ref": config["ref"]}
            inputs = _get_workflow_inputs()
            if inputs:
                payload["inputs"] = inputs
        except ValueError as error:
            return self._send_json(500, {"error": str(error)})

        workflow = urllib.parse.quote(config["workflow"], safe="")
        api_url = (
            f"https://api.github.com/repos/{config['repository']}"
            f"/actions/workflows/{workflow}/dispatches"
        )
        request = urllib.request.Request(
            api_url,
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "User-Agent": "gptme-webui-dev-deploy",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                if response.status != 204:
                    return self._send_json(
                        502,
                        {
                            "error": "GitHub did not accept the deploy request",
                            "detail": f"Unexpected status {response.status}",
                        },
                    )
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            return self._send_json(
                502,
                {
                    "error": "GitHub rejected the deploy request",
                    "github_status": error.code,
                    "detail": detail,
                },
            )
        except urllib.error.URLError as error:
            return self._send_json(
                502,
                {
                    "error": "Could not reach GitHub",
                    "detail": str(error.reason),
                },
            )

        return self._send_json(
            202,
            {
                "status": "queued",
                "message": "Staging deploy workflow queued",
                "repository": config["repository"],
                "workflow": config["workflow"],
                "ref": config["ref"],
                "actions_url": config["actions_url"],
            },
        )


def run_server(port=5701, bind="0.0.0.0"):
    """Run the HTTP server."""
    with socketserver.TCPServer((bind, port), SPAHTTPRequestHandler) as httpd:
        print(f"Serving on {bind}:{port}")
        print("SPA routing enabled - serving index.html for non-asset routes")
        if _get_deploy_config()["enabled"]:
            print("Dev deploy trigger enabled at /api/dev/deploy-staging")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")


if __name__ == "__main__":
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5701
    run_server(port=port)
