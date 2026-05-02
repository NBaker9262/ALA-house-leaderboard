import re

with open('control.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Insert smart event panel
insert_index = html.find('<section class="reason-lock" id="reasonLockPanel" data-workspace-panel="scoring">')
panel_html = '''  <section class="smart-event-panel" id="smartEventPanel" data-workspace-panel="scoring">
    <div id="eventStateBar" class="event-state-bar">
      <h3 id="eventStateTitle">Event Locked</h3>
      <p id="eventStateText">Start an event to unlock scoring controls.</p>
    </div>
    
    <div class="smart-event-controls">
      <div id="openEventStatus" class="open-event-status">No open event.</div>
      <p id="eventActionHint">Step 1: Enter event name, then click <strong>Start Event</strong>.</p>
      
      <div class="checkpoint-row" id="smartEventActions">
        <input id="checkpointName" type="text" maxlength="60" placeholder="Event name (example: Spring Sports Assembly)" data-action-control>
        <button id="checkpointPreBtn" class="btn btn-primary" type="button" data-action-control>Start Event</button>
        <button id="checkpointPostBtn" class="btn btn-primary is-hidden" type="button" data-action-control>Close Event</button>
        <button id="undoEventActionBtn" class="btn btn-outline is-hidden" type="button" data-action-control>Undo Last</button>
        <button id="checkpointLegacyBtn" class="btn btn-ghost" type="button" hidden>Close Legacy Event</button>
      </div>

      <div id="eventItemRow" class="checkpoint-row is-hidden">
        <input id="eventItemName" type="text" maxlength="40" placeholder="Optional tag (e.g. Volleyball Game 1)" data-action-control>
      </div>
      <p id="eventItemHint" class="muted is-hidden" style="font-size: 12px;">Tag points to a specific activity inside this event.</p>
      <div id="eventLabelChips" class="reason-pill-row is-hidden"></div>
    </div>
  </section>

'''
if panel_html not in html:
    html = html[:insert_index] + panel_html + html[insert_index:]

# 2. Remove the old checkpointRow
html = re.sub(r'\s*<div class="checkpoint-row" id="checkpointRow">\s*<input id="checkpointName".*?</button>\s*</div>', '', html, flags=re.DOTALL)

# 3. Truncate the spaghetti javascript
# Find the end of the <script> block
end_script_idx = html.find('</script>', html.find('// Export for use in control.js'))
if end_script_idx != -1:
    good_html = html[:end_script_idx + 9] + '\n<script type="module" src="./control.js"></script>\n</body>\n</html>\n'
    html = good_html

with open('control.html', 'w', encoding='utf-8') as f:
    f.write(html)
