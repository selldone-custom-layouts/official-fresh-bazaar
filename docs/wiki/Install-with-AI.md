# Install with AI

An AI coding agent (for example **Claude Code** or **OpenAI Codex**) can put Old Bazaar 3D on your Selldone shop: fork, point it at your shop, build, upload and attach, while you do the few steps that need you.

## 1. Prepare

| You need | Why | Where |
| --- | --- | --- |
| A Selldone shop with categories and products | The bazaar is built from your live catalogue | [selldone.com](https://selldone.com) |
| Your shop's **handle** (the name in `name.myselldone.com`) and **shop id** | `.env` and attaching the Layout | Shop dashboard |
| A GitHub account | Your own copy of this repository | [github.com](https://github.com) |
| **Git**, **Node.js 20+** and **Python 3** | Building and packaging | — |
| An AI coding agent that can run terminal commands | Does the work | Claude Code, Codex… |
| Optional: the **Selldone MCP connector** for your shop | Lets the agent attach the Layout and add your domain | [selldone.com/mcp/connections](https://selldone.com/mcp/connections) |

**Your part** (the agent will ask when the time comes):

- **Sign in to the Selldone CLI**: run `selldone`, choose **Login**, approve in your browser and type your **2FA code**. Never give a password or code to the agent.
- **Confirm the upload** when the CLI asks.
- **Approve the GitHub fork**, or create the repository yourself.

## 2. Paste this prompt into your agent

```text
Set up the Selldone custom Layout "Old Bazaar 3D" on my Selldone shop.

My shop handle: {SHOP_HANDLE}        (as in {SHOP_HANDLE}.myselldone.com)
My shop id: {SHOP_ID}
My GitHub account: {GITHUB_USER}
New Layout package name (lowercase, permanent, unique to me): {PACKAGE}   e.g. mybrand-bazaar-3d

Source: https://github.com/selldone-custom-layouts/official-fresh-bazaar

Before you change anything, read completely: README.md, FRESH-MARKET-3D.md, every file in
docs/wiki/, and .ai-agent/AGENTS.md, .ai-agent/SKILL.md, .ai-agent/AI_WORKFLOW.md.

Then:
1. Fork the repository to my account (or create {GITHUB_USER}/{PACKAGE}) and clone it.
   Keep https://github.com/selldone/storefront as a fetch-only "upstream".
2. npm install. Put my shop in .env (VITE_APP_SAMPLE_SHOP_NAME={SHOP_HANDLE}). Run the dev
   server, open /?market-nointro and check: a stall per category, crates with my products,
   the product inspector, add to basket. Tell me what my shop's data is missing
   (docs/wiki/Shop-Requirements.md) instead of hard-coding anything.
3. Set manifest.json "package" to {PACKAGE} and "version" to 1.0.0, and layout.identity.json
   to the same package with layout_id null.
4. Build and check the release exactly as docs/wiki/Build-and-Upload.md says. Commit and
   push. Then ask me to run the upload and confirm it myself.
5. When the upload is verified, attach the version to my shop (or a domain) as
   docs/wiki/Go-Live.md says, set Home to the shop page, and verify the live address.
```

## 3. What to expect

- About an hour, most of it building and checking.
- The agent stops twice for you: the CLI sign-in (if it has expired) and the upload confirmation.
- At the end: your fork, a Layout version on your Selldone account, and your shop's address showing the bazaar.
