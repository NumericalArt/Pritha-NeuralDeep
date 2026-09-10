# Connect Telegram

1. Open [BotFather](https://t.me/BotFather) in Telegram, send `/newbot`, and follow
   its instructions. Save the token in Brief Desk Settings, not in an AI chat.
2. Add the bot to your destination group or channel. In a channel, grant it the
   administrator permission to post messages.
3. Enter the public channel's `@username` or the numeric chat ID in Settings.
4. Save and click **Check Telegram**. This reads bot identity, chat and permissions;
   it does not send a message.
5. Optionally click **Test message** and confirm. Then publish a reviewed brief
   using its separate publication confirmation.

## Private destination IDs

For a private group, add the bot and send a command mentioning it in that group.
For a private channel, add the bot as an administrator and create a channel post.
Use Telegram's official `getUpdates` API locally to inspect `message.chat.id` or
`channel_post.chat.id`. Do not share your token with a third-party ID lookup bot.
A developer can run the bundled `node scripts/telegram-destination.mjs` once after
saving the token. It reads pending updates without enabling a command loop or
acknowledging them; if a webhook is already configured, use that integration's
update payload instead. Do not delete an existing webhook just to discover an ID.

No public hostname, webhook or Tailscale is needed for outgoing publication.
If the outcome of sending is unknown, inspect Telegram before any manual retry.

References: [BotFather](https://core.telegram.org/bots/features#botfather),
[Telegram Bot API](https://core.telegram.org/bots/api).
