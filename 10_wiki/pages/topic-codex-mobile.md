---
id: wiki-page-topic-codex-mobile
type: wiki-page
status: generated
created: 2026-05-17
updated: 2026-05-17
topics:
  - codex-mobile
  - codex-desktop
  - remote-connections
  - ssh
  - mobile-agent-control
  - coding-agents
  - dx
  - security
tools:
  - codex
  - codex-desktop
  - chatgpt-mobile
  - ssh
  - macos
  - iphone
  - telegram-bot
sources:
  - 02_briefs/2026-05-17-codex-mobile-desktop-remote-connection-brief.md
  - 01_sources/notes/2026-05-17-codex-mobile-desktop-remote-connection-source-note.md
  - 01_sources/signals/2026-05-17-2026-05-17-telegram-telegram-user-53-telegram-photo-signal.md
  - raw-source-purged
  - https://openai.com/index/work-with-codex-from-anywhere/
related:
  briefs:
    - 02_briefs/2026-05-17-codex-mobile-desktop-remote-connection-brief.md
  wiki_pages:
    - 10_wiki/pages/topic-codex-desktop.md
    - 10_wiki/pages/topic-remote-connections.md
    - 10_wiki/pages/topic-ssh.md
    - 10_wiki/pages/topic-mobile-agent-control.md
    - 10_wiki/pages/topic-coding-agents.md
    - 10_wiki/pages/topic-dx.md
    - 10_wiki/pages/topic-security.md
    - 10_wiki/pages/tool-codex.md
    - 10_wiki/pages/tool-codex-desktop.md
    - 10_wiki/pages/tool-chatgpt-mobile.md
    - 10_wiki/pages/tool-ssh.md
    - 10_wiki/pages/tool-macos.md
    - 10_wiki/pages/tool-iphone.md
    - 10_wiki/pages/tool-telegram-bot.md
    - 10_wiki/pages/concept-brief.md
generated_from:
  - 02_briefs/2026-05-17-codex-mobile-desktop-remote-connection-brief.md
review_status: unreviewed
confidence: low
last_linted: 
---
# Wiki Page: topic: codex-mobile

Status: generated
Review status: unreviewed
Confidence: low

## Generated summary

This generated page tracks codex-mobile as a topic in the Techscope knowledge base. Use it for navigation and synthesis only; follow the sources before making standards or decisions.

## Current synthesis

- From `02_briefs/2026-05-17-codex-mobile-desktop-remote-connection-brief.md`: Скриншот показывает, что мобильный Codex/ChatGPT UI уже работает как поверхность управления подключениями: виден существующий `Codex Desktop` host и форма `Add SSH Host`. В сочетании с официальной статьей OpenAI от 2026-05-14 это подтверждает важный UX-сдвиг: Codex можно использовать не только сидя за рабочей машиной, но и как long-running agent, которым пользователь управляет с телефона. - Mobile supervision становится отдельной возможностью coding-agent среды. - Trusted execution host остается MacBook/Mac mini/devbox; телефон только управляет и подтверждает. - Remote SSH нужно учитывать как часть Codex operating environment. - Для Techscope это усиливает требование коротких человекочитаемых статусов: пользователь будет часто смотреть результат с телефона. - Для будущих агентов нужно проектировать approval/checkpoint behavior, а не только "запустить задачу и ждать". Keep this as a...

## Evidence sources

- 02_briefs/2026-05-17-codex-mobile-desktop-remote-connection-brief.md
- 01_sources/notes/2026-05-17-codex-mobile-desktop-remote-connection-source-note.md
- 01_sources/signals/2026-05-17-2026-05-17-telegram-telegram-user-53-telegram-photo-signal.md
- raw-source-purged
- https://openai.com/index/work-with-codex-from-anywhere/

## Related pages

- [[pages/topic-codex-desktop|topic: codex-desktop]]
- [[pages/topic-remote-connections|topic: remote-connections]]
- [[pages/topic-ssh|topic: ssh]]
- [[pages/topic-mobile-agent-control|topic: mobile-agent-control]]
- [[pages/topic-coding-agents|topic: coding-agents]]
- [[pages/topic-dx|topic: dx]]
- [[pages/topic-security|topic: security]]
- [[pages/tool-codex|tool: codex]]
- [[pages/tool-codex-desktop|tool: codex-desktop]]
- [[pages/tool-chatgpt-mobile|tool: chatgpt-mobile]]
- [[pages/tool-ssh|tool: ssh]]
- [[pages/tool-macos|tool: macos]]

## Open questions

- What curated artifact should promote or reject this generated synthesis?
