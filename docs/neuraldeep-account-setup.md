# Get a NeuralDeep account and API key

NeuralDeep is a convenient, cost-effective fit for Pritha: one provider connection
covers model execution, voice, and search, and Brief Desk ND can reuse the parent
credential. The service offers subscription and pay-as-you-go options, with RUB
payments using Russian cards or SBP. See the current [plans](https://neuraldeep.ru/pricing).

## Four steps

1. **Register.** Open the [NeuralDeep dashboard](https://neuraldeep.ru/app).
   Choose **Registration / Регистрация** and sign up with email and password,
   or use **Yandex ID**. Complete the site's account setup.
2. **Get your key.** Open your dashboard and copy your API key. The
   [official documentation](https://neuraldeep.ru/docs) says a key is created
   automatically when you register. Use an account on **neuraldeep.ru** for
   this distribution, whose API endpoint is `https://api.neuraldeep.ru/v1`.
3. **Choose access for your models.** Review your dashboard's plan, balance, and
   limits. Registration has a free option, but Pritha's default **Kimi K2.6**
   requires paid access through an eligible plan or the pay-as-you-go wallet.
   Check the [model catalog](https://neuraldeep.ru/models) before choosing.
4. **Connect Pritha.** Start Pritha, open **Settings → NeuralDeep**, paste the key,
   save, and check the connection. For Brief Desk ND, select the parent Pritha
   connection in the agent's Settings to reuse it. Telegram setup is separate
   and needed only when you want to publish a brief.

On macOS, Pritha stores the key in its instance-specific Keychain entry. On other
systems, use the server environment as described in [START_HERE](../START_HERE.md).
Keep the key out of Git, screenshots, and coding-assistant conversations.

Registration and key-issuance steps checked against the
[official login page](https://hub.neuraldeep.ru/login) and
[API documentation](https://neuraldeep.ru/docs) on September 10, 2026.
