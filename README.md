# WhatsApp Proto

Protocol Buffer definitions extracted and compiled from the official WhatsApp Web client. Provides typed message structures for encoding and decoding WhatsApp protocol messages.

## Installation

```bash
npm install @raphaelvserafim/whatsapp-proto
```

> Requires Node.js >= 18.0.0

## Usage

```javascript
const { proto } = require('@raphaelvserafim/whatsapp-proto');

// Encode a message
const message = proto.Message.create({
  conversation: 'Hello!'
});
const buffer = proto.Message.encode(message).finish();

// Decode a message
const decoded = proto.Message.decode(buffer);
console.log(decoded.conversation); // 'Hello!'
```

### TypeScript

Full type definitions are included out of the box:

```typescript
import { proto } from '@raphaelvserafim/whatsapp-proto';

const info: proto.IWebMessageInfo = {
  key: {
    remoteJid: '5511999999999@s.whatsapp.net',
    fromMe: true,
    id: 'MESSAGE_ID'
  },
  message: {
    conversation: 'Hello from TypeScript!'
  }
};

const encoded = proto.WebMessageInfo.encode(
  proto.WebMessageInfo.create(info)
).finish();
```

## Available Types

223 entities including messages, enums, and nested types. Some of the main ones:

### Core Messages
- `Message` - Main message container with all message types
- `WebMessageInfo` - Complete message info with metadata, key, and content
- `MessageKey` - Message identifier (remoteJid, fromMe, id)
- `ContextInfo` - Reply context, mentions, forwarding info

### Media
- `Message.ImageMessage`
- `Message.VideoMessage`
- `Message.AudioMessage`
- `Message.DocumentMessage`
- `Message.StickerMessage`

### Rich Messages
- `Message.ExtendedTextMessage` - Links with preview
- `Message.ContactMessage` / `Message.ContactsArrayMessage`
- `Message.LocationMessage` / `Message.LiveLocationMessage`
- `Message.ListMessage` / `Message.ButtonsMessage`
- `Message.TemplateMessage`
- `Message.PollCreationMessage`

### Device & Identity
- `ADVDeviceIdentity` / `ADVSignedDeviceIdentity`
- `ADVKeyIndexList`
- `DeviceProps` / `DeviceCapabilities`
- `CompanionEphemeralIdentity`

### Signal Protocol
- `SignalMessage` / `PreKeySignalMessage`
- `SenderKeyDistributionMessage`
- `SessionStructure` / `RecordStructure`

### Sync & History
- `HistorySync` / `HistorySyncMsg`
- `SyncActionValue` / `SyncdPatch`
- `Conversation` / `PastParticipants`

### Payments & Business
- `PaymentInfo` / `PaymentBackground`
- `BizAccountPayload` / `BizIdentityInfo`
- `Money`

### AI / Bot
- `BotMetadata` / `BotPluginMetadata`
- `AIRichResponseMessage`
- `BotFeedbackMessage`

## API

Every message type exposes the same static methods:

| Method | Description |
|---|---|
| `.create(properties)` | Create a new instance with defaults |
| `.encode(message)` | Encode to a `Writer` (call `.finish()` for `Uint8Array`) |
| `.encodeDelimited(message)` | Encode with length delimiter |
| `.decode(reader, [length])` | Decode from buffer or reader |
| `.decodeDelimited(reader)` | Decode length-delimited |
| `.verify(message)` | Validate a plain object (`null` if valid) |
| `.fromObject(object)` | Convert plain object to message |
| `.toObject(message)` | Convert message to plain object |

## Building from Source

Clone and rebuild the proto definitions from the latest WhatsApp Web client:

```bash
git clone https://github.com/user/whatsapp-proto.git
cd whatsapp-proto
npm install
npm run build
```

The build process:
1. Fetches the WhatsApp Web service worker
2. Extracts the protobuf schema from the client JavaScript
3. Generates `proto/whatsapp.proto`
4. Compiles to `dist/index.js` (CommonJS) + `dist/index.d.ts` (TypeScript)

## Project Structure

```
whatsapp-proto/
  src/
    extractors/index.js   # Extracts .proto from WhatsApp Web JS
    compilers/index.js     # Compiles .proto to JS + TS
    scripts/build.js       # Build orchestrator
  proto/
    whatsapp.proto         # Generated proto3 definitions
  dist/
    index.js               # Compiled protobufjs runtime
    index.d.ts             # TypeScript definitions
  data/
    whatsapp_version.json  # Detected WhatsApp Web version
```

## License

MIT

## Disclaimer

This package is for educational and research purposes. The protobuf definitions are extracted from the publicly available WhatsApp Web client. Use in accordance with WhatsApp's Terms of Service.
