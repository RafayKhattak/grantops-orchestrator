# GrantOps

Local grant-operations workspace: PDF extraction, per-organization retrieval, Groq drafting, citation checks, and a human approval gate.

The signed-in workspace is the organization named by `DEMO_ORGANIZATION_SLUG`. Every grant query includes that organization id. A second organization is seeded so the boundary is visible on the Reports page. This is not user authentication.

## Setup

```bash
npm install
npm run db:setup
npm run sample:rfp
```

Put a Groq key in `.env` as `GROQ_API_KEY`, then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Upload `fixtures/sample-rfp.pdf`, build the index (or let the drafting agent do it), write a draft, fix any citation failures, approve, and export.

## What the export does

Export always writes a Markdown file under `storage/`. A Google Doc is created only when `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and either `GOOGLE_DRIVE_FOLDER_ID` or `GOOGLE_SHARE_WITH` are set. If those values are missing, the app does not pretend the push succeeded.

## Embeddings

`EMBEDDING_PROVIDER=auto` calls Groq `nomic-embed-text-v1_5` when the account serves it. Nomic inputs are prefixed with `search_document:` or `search_query:`. If that model is missing, passages are embedded locally with `onnx-community/all-MiniLM-L6-v2-ONNX`. Vectors from different models are never compared.

Drafting always uses Groq. The default chat model is `openai/gpt-oss-120b` (`GROQ_CHAT_MODEL`).

## Limits

Text-based PDFs only. Scanned pages are rejected. There is no OCR. Chunks are about 500 words with a 50-word overlap, and each chunk keeps the page numbers the parser produced.

## Tests

```bash
npm test
```
