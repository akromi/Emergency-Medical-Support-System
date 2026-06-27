# TRIAGE-LINK — Language Packs

Add a language to TRIAGE-LINK **without an app update**. A *language pack* is a
small JSON file you load at runtime from the **⋯ menu**; it's stored on the
device and survives reloads. Missing keys fall back to English, so a partial
translation never blanks the UI.

## Add a language (translator workflow)

1. In the app, open the **⋯ menu → ⬇ Language template**. This downloads
   `triage-link-language-template.json` containing every English string.
2. Edit the file:
   - `code` — a short language code (BCP-47-ish, e.g. `sw`, `uk`, `ps`). Also used
     as the speech tag for the guided tour's voice-over.
   - `name` — the display name shown in the language list (e.g. `Kiswahili`).
   - `rtl` — `true` for right-to-left scripts (Arabic, Hebrew, Urdu, Persian…),
     else `false`.
   - `strings` — translate the **values**; keep the **keys** unchanged. Leave any
     value untranslated to fall back to English.
3. Back in the app, **⋯ menu → ＋ Language pack**, choose your file. The app
   registers it, switches to it, and remembers it.

## Schema

```jsonc
{
  "code": "sw",            // string, required — language/speech code
  "name": "Kiswahili",     // string, required — display name
  "rtl": false,            // boolean, optional — right-to-left script
  "strings": {             // object, required — { key: translated value }
    "app.sub": "Rekodi ya Majeruhi",
    "hdr.new": "+ Majeruhi mpya"
    // …any subset of the template keys; the rest fall back to English
  }
}
```

## Notes

- **Fully offline** — packs load from a local file and persist in the browser's
  storage; nothing is uploaded.
- **Per device** — a pack lives on the device it was loaded on. To roll one out
  to a fleet, distribute the JSON file (and load it on each device, or bundle it
  via your deployment).
- **Built-ins are protected** — English / French / Arabic / Persian ship in the
  app and can't be overwritten away; a pack adds to them.
- **Keep keys in sync** — when the app adds new strings, re-download the template
  and fill in the new keys; until then they show in English.
