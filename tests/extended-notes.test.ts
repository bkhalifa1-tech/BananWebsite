import test from "node:test";
import assert from "node:assert/strict";
import { cleanNote } from "../server/content";
import { gradeSummary, requiredRemainingGrade } from "../src/lib/academic";
test("advanced note formats survive sanitation while external images, handlers and unsafe styles are removed", () => {
  const clean = cleanNote(
    '<table><tr><td colspan="2">Study</td></tr></table><span data-type="inline-math" data-latex="x^2"></span><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked></label><div>Done</div></li></ul><span style="color:#216348;position:fixed" onclick="alert(1)">Color</span><img src="https://tracker.example/image"><img src="/api/materials/11111111-1111-1111-1111-111111111111/file"><script>bad()</script>',
  );
  assert.match(clean, /<table>/);
  assert.match(clean, /data-latex="x\^2"/);
  assert.match(clean, /data-checked="true"/);
  assert.match(clean, /color:#216348/);
  assert.match(clean, /\/api\/materials/);
  assert.doesNotMatch(clean, /tracker|onclick|position|script/);
});
test("remaining grade calculator handles reachable, secured, impossible and completed targets", () => {
  const s = gradeSummary([{ weight: 60, total: 100, score: 80 }]);
  assert.equal(requiredRemainingGrade(s, 80), 80);
  assert.equal(requiredRemainingGrade(s, 95), 117.5);
  assert.equal(requiredRemainingGrade(s, 40), -20);
  assert.equal(
    requiredRemainingGrade(
      gradeSummary([{ weight: 100, total: 100, score: 80 }]),
      90,
    ),
    null,
  );
  assert.equal(requiredRemainingGrade(s, NaN), null);
});
