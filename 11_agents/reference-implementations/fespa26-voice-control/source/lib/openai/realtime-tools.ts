export type RealtimeToolDefinition = {
  type: "function"
  name: string
  description: string
  parameters: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
}

function codexCliToolEnabled() {
  return process.env.FESPA_ENABLE_CODEX_CLI_TOOL === "true"
}

const codexCliTool: RealtimeToolDefinition = {
  type: "function",
  name: "queue_codex_cli_task",
  description:
    "Legacy fallback. Use only when FESPA_ENABLE_CODEX_CLI_TOOL=true and the operator explicitly asks for Codex CLI. Return the queued job id and do not claim the task is complete.",
  parameters: {
    type: "object",
    properties: {
      task: { type: "string" },
      mode: { type: "string", enum: ["analysis", "feed", "system"] },
      priority: { type: "string", enum: ["normal", "high"] },
      speak_result: { type: "boolean" },
    },
    required: ["task"],
  },
}

function baseRealtimeTools(): RealtimeToolDefinition[] {
  return [
    {
      type: "function",
      name: "save_fespa_source",
      description:
        "Save new booth media descriptions, exhibition notes, links, claims or publication material into FESPA26 local memory so Codex can refine it later and the feed can use it. Do not use this for requests to change the app UI, agent behavior, code, settings, routing or system workflow.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          text: { type: "string" },
          url: { type: "string" },
          language: { type: "string", enum: ["ru", "en"] },
        },
        required: ["text"],
      },
    },
    {
      type: "function",
      name: "get_fespa_feed_context",
      description:
        "Read the latest FESPA26 feed cards and source counts before suggesting edits or next actions.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number" },
        },
      },
    },
    {
      type: "function",
      name: "queue_codex_feed_task",
      description:
        "Send a heavier feed task to the Codex App thread for media analysis, source verification or publication/feed copywriting. If Codex App is unavailable, the server captures a local fallback job without publishing. Do not use this for changing FESPA26 app UI, code, agent behavior, routing or system workflow.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string" },
          priority: { type: "string", enum: ["normal", "high"] },
        },
        required: ["task"],
      },
    },
    {
      type: "function",
      name: "queue_codex_card_update",
      description:
        "Send Codex App a task to enrich or rewrite existing feed cards. Use when the operator refers to card numbers, card titles, an existing media card, or asks to update/refresh/edit/enrich already-created cards using memory, PDFs, media, or web research. The fallback queue can capture safe draft/reviewed card edits but does not publish.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string" },
          card_refs: {
            type: "array",
            items: { type: "string" },
          },
          auto_apply: { type: "boolean" },
          priority: { type: "string", enum: ["normal", "high"] },
        },
        required: ["task"],
      },
    },
    {
      type: "function",
      name: "queue_codex_system_task",
      description:
        "Send a real implementation task to the Codex App thread to change FESPA26 itself: UI controls, tabs, buttons, app behavior, voice routing, memory workflow, job runner behavior or project code. Use this when the operator asks to fix, add, remove, move or redesign something in the application or agent system.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string" },
          priority: { type: "string", enum: ["normal", "high"] },
        },
        required: ["task"],
      },
    },
    {
      type: "function",
      name: "run_codex_app_task",
      description:
        "Send a general deep-work task to the Codex App thread using the Codex-in-the-loop adapter. Use when the operator explicitly asks Codex App/thread to handle a complex task and no more specific tool fits.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string" },
          task_type: {
            type: "string",
            enum: [
              "feed_refine",
              "card_update",
              "system_change",
              "explicit",
              "source_search",
              "media_analysis",
              "translation_pass",
              "followup_checklist",
            ],
          },
          priority: { type: "string", enum: ["normal", "high"] },
          speak_result: { type: "boolean" },
        },
        required: ["task"],
      },
    },
    {
      type: "function",
      name: "search_sources",
      description:
        "Queue or perform a general web/official-source verification search for exhibitor facts, claims, product names, links, or FESPA context. Prefer source_scope official for FESPA, Durst, Flora, Scodix, PrintFactory and exhibitor sites.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          source_scope: { type: "string", enum: ["official", "web"] },
          companies: {
            type: "array",
            items: { type: "string" },
          },
          max_results: { type: "number" },
          speak_result: { type: "boolean" },
        },
        required: ["query"],
      },
    },
    {
      type: "function",
      name: "analyze_uploaded_media",
      description:
        "Queue Codex analysis for the latest or specified uploaded image, PDF, audio, video, or file source. Do not pretend the media has already been analyzed.",
      parameters: {
        type: "object",
        properties: {
          source_id: { type: "string" },
          task: { type: "string" },
          media_kind: {
            type: "string",
            enum: ["latest", "image", "pdf", "audio", "video", "file"],
          },
          speak_result: { type: "boolean" },
        },
      },
    },
    {
      type: "function",
      name: "get_source_details",
      description:
        "Read details for a source, feed card, or Codex job by id, or read the latest source/feed/job. This is read-only.",
      parameters: {
        type: "object",
        properties: {
          target_type: { type: "string", enum: ["source", "feed_item", "job"] },
          id: { type: "string" },
          latest: { type: "boolean" },
        },
        required: ["target_type"],
      },
    },
    {
      type: "function",
      name: "update_feed_draft",
      description:
        "Apply precise operator-requested edits to an existing draft or reviewed feed card without publishing it. Use only for explicit field edits, not for broad rewrite tasks.",
      parameters: {
        type: "object",
        properties: {
          feed_item_id: { type: "string" },
          title_ru: { type: "string" },
          title_en: { type: "string" },
          summary_ru: { type: "string" },
          summary_en: { type: "string" },
          body_ru: { type: "string" },
          body_en: { type: "string" },
          tags: {
            type: "array",
            items: { type: "string" },
          },
          priority: { type: "number" },
        },
        required: ["feed_item_id"],
      },
    },
    {
      type: "function",
      name: "publish_feed_item",
      description:
        "Publish a feed item only after the operator explicitly confirms publication. This changes public feed state; require confirmation_text containing confirm or подтверждаю.",
      parameters: {
        type: "object",
        properties: {
          feed_item_id: { type: "string" },
          confirmation_text: { type: "string" },
        },
        required: ["feed_item_id", "confirmation_text"],
      },
    },
    {
      type: "function",
      name: "mark_claim_verified",
      description:
        "Mark a specific feed claim as verified, partially_verified, or unverified. Verified claims require a source_url.",
      parameters: {
        type: "object",
        properties: {
          feed_item_id: { type: "string" },
          claim_text: { type: "string" },
          verification_status: {
            type: "string",
            enum: ["verified", "partially_verified", "unverified"],
          },
          source_url: { type: "string" },
          note: { type: "string" },
        },
        required: ["feed_item_id", "claim_text", "verification_status"],
      },
    },
    {
      type: "function",
      name: "queue_translation_pass",
      description:
        "Queue Codex to synchronize Russian and English fields for a feed card or source. Use this for bilingual alignment, not publication.",
      parameters: {
        type: "object",
        properties: {
          feed_item_id: { type: "string" },
          source_id: { type: "string" },
          direction: { type: "string", enum: ["ru_to_en", "en_to_ru", "sync"] },
          speak_result: { type: "boolean" },
        },
      },
    },
    {
      type: "function",
      name: "get_runner_status",
      description:
        "Read Codex queue status, lock status, running/failed jobs, and latest completed jobs. This is read-only.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number" },
        },
      },
    },
    {
      type: "function",
      name: "create_followup_checklist",
      description:
        "Queue Codex to turn an operator note into a follow-up checklist for verification, booth questions, media review, or feed preparation.",
      parameters: {
        type: "object",
        properties: {
          note: { type: "string" },
          source_id: { type: "string" },
          feed_item_id: { type: "string" },
          speak_result: { type: "boolean" },
        },
        required: ["note"],
      },
    },
  ]
}

export function buildRealtimeTools() {
  const tools = baseRealtimeTools()
  if (codexCliToolEnabled()) {
    tools.push(codexCliTool)
  }
  return tools
}

export const realtimeTools: RealtimeToolDefinition[] = buildRealtimeTools()
