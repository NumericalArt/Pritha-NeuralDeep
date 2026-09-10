# Pritha launchd templates

The plist files in this directory are portable templates. They intentionally
contain placeholders instead of machine-specific paths.

The current public project name is Pritha. Existing launchd labels and
`TECHSCOPE_ROOT` placeholders remain as compatibility contracts for already
installed local services.

Before installing a service, copy the plist to `~/Library/LaunchAgents/` and
replace:

- `__TECHSCOPE_ROOT__` with the absolute path to this checkout.
- `__HOME__` with your home directory.
- `__USER__` with your short macOS user name.

Do not commit a filled plist back to the repository or to a fork. Filled plist
files contain local paths and may reveal machine-specific configuration.

Copy rendered plists with Dasha-specific filenames, then validate them before loading:

```sh
plutil -lint ~/Library/LaunchAgents/com.techscope.web-dasha.plist
plutil -lint ~/Library/LaunchAgents/com.techscope.telegram-bot-dasha.plist
```

Installing or enabling launchd services is always an explicit user action.
