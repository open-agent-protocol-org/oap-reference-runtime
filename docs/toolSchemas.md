# OAP Tool Schemas (Reference Runtime)

This document lists tool descriptors included in the reference runtime.

## Tool: tools.mock_echo

**Title:** Mock Echo  
**Version:** 0.1.0  
**Description:** Returns the provided input as output. Used for testing tool routing.  
**Permissions required:** `notifications.send`

### Input Schema (JSON Schema)

- Accepts any JSON object.

### Output Schema (JSON Schema)

- Returns:
  - `echoed`: the original input
  - `message`: status message