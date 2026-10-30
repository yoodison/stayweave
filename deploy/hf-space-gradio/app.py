"""Hugging Face Space launcher: runs the prebuilt StayWeave Node server on the Space port.

Docker Spaces need a paid plan, so this Gradio-SDK Space downloads the official Node.js
runtime and the release bundle (verified by SHA-256) and replaces itself with the server.
"""
import hashlib
import os
import pathlib
import tarfile
import urllib.request

NODE_VERSION = "v22.12.0"
NODE_URL = f"https://nodejs.org/dist/{NODE_VERSION}/node-{NODE_VERSION}-linux-x64.tar.xz"
BUNDLE_URL = "https://api.github.com/repos/yoodison/stayweave/releases/assets/692780734"
BUNDLE_SHA256 = "6f566300913aca617a8d8b1512d869c69bdbc3d73d09ab855242f3c1c0e86caf"
ROOT = pathlib.Path("/tmp/stayweave-runtime")


def fetch(url, dest, headers=None):
    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request, timeout=300) as response, open(dest, "wb") as out:
        while chunk := response.read(1 << 20):
            out.write(chunk)


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    node = ROOT / f"node-{NODE_VERSION}-linux-x64" / "bin" / "node"
    if not node.exists():
        archive = ROOT / "node.tar.xz"
        fetch(NODE_URL, archive)
        with tarfile.open(archive) as tar:
            tar.extractall(ROOT, filter="data")
    app = ROOT / "stayweave"
    if not (app / "server" / "index.js").exists():
        archive = ROOT / "bundle.tar.gz"
        fetch(BUNDLE_URL, archive, {"Accept": "application/octet-stream", "User-Agent": "stayweave-space"})
        if hashlib.sha256(archive.read_bytes()).hexdigest() != BUNDLE_SHA256:
            raise SystemExit("StayWeave bundle checksum mismatch")
        with tarfile.open(archive) as tar:
            tar.extractall(ROOT, filter="data")
    env = dict(os.environ)
    env.update({
        "NODE_ENV": "production",
        "HOST": "0.0.0.0",
        "PORT": "7860",
        "NEBIUS_INFERENCE_ENABLED": env.get("NEBIUS_INFERENCE_ENABLED", "true"),
        "STAYWEAVE_INFERENCE_BUDGET_USD": env.get("STAYWEAVE_INFERENCE_BUDGET_USD", "5"),
        "STAYWEAVE_PUBLIC_HOST_SUFFIX": env.get("STAYWEAVE_PUBLIC_HOST_SUFFIX", ".hf.space"),
    })
    os.chdir(app)
    print("Starting StayWeave on port 7860", flush=True)
    os.execve(str(node), [str(node), "server/index.js"], env)


if __name__ == "__main__":
    main()
