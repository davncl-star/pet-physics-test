// Verify that a *shipped browser bundle* actually carries the five fixes,
// by exercising it through the same behaviours the test suite asserts.
// Usage: node probe_bundle_fixcheck.js <bundle-file-or-html> [...more]
const fs = require('fs');
const path = require('path');

function loadBundle(file) {
    let src = fs.readFileSync(file, 'utf8');
    if (file.toLowerCase().endsWith('.html')) {
        const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
        const matterBlock = blocks.find(b => b.includes('matter-js'));
        if (!matterBlock) throw new Error('no matter bundle found in ' + file);
        src = matterBlock;
    }
    const module_ = { exports: {} };
    const exports_ = module_.exports;
    // Page bundles start with `window.__BOOT.stage = 'matter';` — give the
    // sandbox a __BOOT object or the whole bundle throws before defining Matter.
    const g = { __BOOT: {} };
    const fn = new Function('module', 'exports', 'window', 'self', 'globalThis', src + '\n;return (typeof Matter!=="undefined")?Matter:module.exports;');
    const out = fn(module_, exports_, g, g, g);
    const Matter = out && out.Engine ? out : module_.exports;
    if (!Matter || !Matter.Engine) throw new Error('bundle did not expose Matter: ' + file);
    return Matter;
}

function f2_constraintStiffness(Matter) {
    const { Constraint, Bodies } = Matter;
    const c = Constraint.create({ pointA: { x: 0, y: 0 }, bodyB: Bodies.circle(200, 0, 5), stiffness: 0, length: 10 });
    return { ok: c.stiffness === 0, detail: `stiffness=${c.stiffness} (must stay 0, not be coerced to 1)` };
}

function f3_timeScale(Matter) {
    const { Engine, Bodies, Composite } = Matter;
    const engine = Engine.create();
    const box = Bodies.rectangle(0, 0, 40, 40);
    Composite.add(engine.world, box);
    box.velocity.x = 3; box.velocity.y = 1;
    box.timeScale = 0;
    for (let i = 0; i < 5; i++) Engine.update(engine, 1000 / 60);
    const bad = !Number.isFinite(box.velocity.x) || !Number.isFinite(box.velocity.y)
        || !Number.isFinite(box.position.x) || !Number.isFinite(box.position.y);
    return { ok: !bad, detail: `pos=(${box.position.x.toFixed(2)},${box.position.y.toFixed(2)}) vel=(${box.velocity.x.toFixed(2)},${box.velocity.y.toFixed(2)})` };
}

function f4_supportWake(Matter) {
    const { Engine, Bodies, Composite } = Matter;
    const engine = Engine.create({ enableSleeping: true });
    const ground = Bodies.rectangle(0, 200, 600, 40, { isStatic: true });
    const plank = Bodies.rectangle(0, 120, 200, 16, { isStatic: true });
    const box = Bodies.rectangle(0, 84, 40, 40, { sleepThreshold: 30 });
    Composite.add(engine.world, [ground, plank, box]);
    for (let i = 0; i < 400; i++) Engine.update(engine, 1000 / 60);
    const sleptFirst = box.isSleeping;
    Composite.remove(engine.world, plank);
    for (let i = 0; i < 30; i++) Engine.update(engine, 1000 / 60);
    const fell = box.position.y > 84 + 5;
    return { ok: sleptFirst && !box.isSleeping && fell, detail: `sleptBefore=${sleptFirst} sleepingAfter=${box.isSleeping} y=${box.position.y.toFixed(2)}` };
}

function f5_clearPairs(Matter) {
    const { Engine, Bodies, Composite } = Matter;
    const engine = Engine.create({ enableSleeping: true });
    const ground = Bodies.rectangle(0, 100, 400, 40, { isStatic: true });
    const a = Bodies.rectangle(0, 60, 40, 40, { sleepThreshold: 20 });
    const b = Bodies.rectangle(2, 20, 40, 40, { sleepThreshold: 20 });
    Composite.add(engine.world, [ground, a, b]);
    for (let i = 0; i < 300; i++) Engine.update(engine, 1000 / 60);
    const before = engine.pairs.list.length;
    Composite.clear(engine.world, true);
    for (let i = 0; i < 5; i++) Engine.update(engine, 1000 / 60);
    return { ok: before > 0 && engine.pairs.list.length === 0, detail: `pairsBefore=${before} pairsAfterClear=${engine.pairs.list.length}` };
}

function f1_compoundInertia(Matter) {
    const { Body, Bodies, Composite } = Matter;
    const p1 = Bodies.rectangle(-40, 0, 20, 20, { density: 0.001 });
    const p2 = Bodies.rectangle(40, 0, 20, 20, { density: 0.001 });
    const comp = Body.create({ parts: [p1, p2] });
    const dA = -40, dB = 40; // offsets from centre of mass
    const expected = (p1.inertia + p1.mass * dA * dA) + (p2.inertia + p2.mass * dB * dB);
    const rel = Math.abs(comp.inertia - expected) / expected;
    return { ok: rel < 1e-6, detail: `compound=${comp.inertia.toFixed(3)} expected=${expected.toFixed(3)} rel=${rel.toExponential(2)}` };
}

function f6_sleepingCompoundPairs(Matter) {
    const { Engine, Bodies, Body, Composite } = Matter;
    const engine = Engine.create({ enableSleeping: true });
    const ground = Bodies.rectangle(0, 260, 600, 40, { isStatic: true });
    const compA = Body.create({ parts: [Bodies.rectangle(-15, 0, 20, 20, { sleepThreshold: 20 }),
                                        Bodies.rectangle(15, 0, 20, 20, { sleepThreshold: 20 })], sleepThreshold: 20 });
    const compB = Body.create({ parts: [Bodies.rectangle(-15, 0, 20, 20, { sleepThreshold: 20 }),
                                        Bodies.rectangle(15, 0, 20, 20, { sleepThreshold: 20 })], sleepThreshold: 20 });
    Body.setPosition(compA, { x: 0, y: 220 });
    Body.setPosition(compB, { x: 0, y: 199 });
    Composite.add(engine.world, [ground, compA, compB]);
    for (let i = 0; i < 300; i++) Engine.update(engine, 1000 / 60);
    const slept = compA.isSleeping && compB.isSleeping;
    return { ok: slept && engine.pairs.list.length > 0, detail: `slept=${slept} pairsWhileSleeping=${engine.pairs.list.length}` };
}

const files = process.argv.slice(2);
if (!files.length) {
    console.error('usage: node probe_bundle_fixcheck.js <file> [...]');
    process.exit(2);
}
for (const f of files) {
    const label = path.basename(f);
    let Matter;
    try { Matter = loadBundle(f); } catch (e) { console.log(`${label.padEnd(26)} LOAD FAIL ${e.message}`); continue; }
    const results = [['F1 compound inertia', f1_compoundInertia], ['F2 stiffness 0', f2_constraintStiffness],
                     ['F3 timeScale=0', f3_timeScale],
                     ['F4 support wake', f4_supportWake], ['F5 clear pairs', f5_clearPairs],
                     ['F6 sleeping compound pairs', f6_sleepingCompoundPairs]];
    const verdicts = [];
    console.log('=== ' + label);
    for (const [name, fn] of results) {
        let r;
        try { r = fn(Matter); } catch (e) { r = { ok: false, detail: 'threw: ' + e.message }; }
        verdicts.push((r.ok ? 'PASS' : 'FAIL'));
        console.log(`  ${(r.ok ? 'PASS' : 'FAIL')}  ${name.padEnd(20)} ${r.detail}`);
    }
    console.log(`  -> ${label}: ${verdicts.filter(v => v === 'PASS').length}/${verdicts.length} pass`);
}
