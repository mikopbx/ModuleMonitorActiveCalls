# Active Calls — module for MikoPBX

*Read this in other languages:* [English](README.md), [Русский](readme.ru.md).

## Description

Paid add-on module for MikoPBX. Designed to monitor ongoing calls and let supervisors perform actions on active calls.

Official docs: [Active Calls](https://docs.mikopbx.com/mikopbx/modules/miko/aktivnye-vyzovy)

## Key features

- Display all active calls
- Call actions: Listen, Whisper, Join, Hang up
- Display the selected queue state (waiting calls and agents)
- Multi-user mode, compatible with the “Access control” module

## Interface and usage

### Current employee setup
- With limited permissions, “Employee” and “Extension” are filled automatically.
- With administrator rights, click “Username” to choose an employee.
- Supervisor actions (“Connect to the call”) are performed on behalf of the chosen employee.

### Displayed queue
- Left column: waiting calls — caller number and waiting time. Click the header to pick another queue.
- Right column: agents state with “Extension”, “Name”, “Peer”. Statuses are color‑coded.

### All active calls
- Each row represents a single call; status is color‑coded.
- Columns: “Start” (hh:mm:ss), “From”, “To”, “Ringing” (hh:mm:ss), “Talk” (hh:mm:ss).

### Call actions
- “Hang up” — ends the selected call.
- “Listen” — originates a call from the employee’s extension and connects silently (one‑way monitor).
- “Whisper” — connects to the call; the employee can speak to the agent only (customer cannot hear).
- “Join” — barges into the call and fully participates.

## Installation
1. Install via MikoPBX web UI (Modules Marketplace → Install new module).
2. Activate the license (if required).
3. Open the “Active Calls” module and, if needed, select the employee and the queue.

## Support
- Documentation: [Active Calls](https://docs.mikopbx.com/mikopbx/modules/miko/aktivnye-vyzovy)
- Telegram for developers: [@mikopbx_dev](https://t.me/joinchat/AAPn5xSqZIpQnNnCAa3bBw)
