/* ============================================================
   easyWins — clickable pitch prototype

   No backend, no network, no persistence. All state is the plain object
   below, held in memory. Plain code on purpose: meant to be read.

   The model:
     - Every on-time payment IS an easyWin. One payment, one easyWin.
     - easyWins accumulate and unlock rewards at 5, then 7, then 10.
     - Miss a payment and the count goes back to 0.

   The presenter picks a CUSTOMER JOURNEY (where the customer is today),
   then sends notifications from that point.
   ============================================================ */

'use strict';

/* ------------------------------------------------------------
   Config — every demo-tunable value lives here
   ------------------------------------------------------------ */

const CONFIG = {
  brand: 'goeasy',
  program: 'easyWins',
  notifyApp: 'goeasy connect',      // the app notifications come from

  // Obviously fictional. Never anything that could read as a real customer.
  customer: { first: 'Des', full: 'Des Sample' },

  currency: 'CAD',

  /* Tiered goals, in easyWins. Each goal is a fresh run, NOT a running total:
     5 easyWins unlocks the first product, then 7 more unlocks the second,
     then 10 more unlocks the third. Rename these freely. */
  tiers: [
    {
      goal: 5,
      name: 'Credit Optimizer',
      term: 'free to use',
      tagline: 'A personalised plan to build your credit score',
      blurb: 'See exactly what is moving your score and what to do next. Unlocked and free to use.'
    },
    {
      goal: 7,
      name: 'easyadvantage+',
      term: 'free to use',
      tagline: 'Member perks, discounts and rate benefits',
      blurb: 'Everyday savings and member-only rates across goeasy. Unlocked and free to use.'
    },
    {
      goal: 10,
      name: 'Home & Auto',
      term: 'free to use',
      tagline: 'Cover for your home and your vehicle',
      blurb: 'Home and auto protection in one place, at member rates. Unlocked and free to use.'
    }
  ],

  /* The big number on the card is the balance still owing, so it visibly
     drops after every payment. `original` is what was borrowed, and the bar
     shows how much of it has been paid off. */
  loan: {
    name: 'Unsecured Personal Loan',
    original: 15100,
    balance: 9854.20,
    payment: 492.71
  },

  // Second loan is for texture only — payments are applied to the first.
  loan2: {
    name: 'Powersports Financing',
    original: 25000,
    balance: 15000,
    payment: 500.00
  },

  testCard: {
    type: 'Debit MasterCard',
    number: '5100 2700 0000 0007',   // documented MasterCard test number
    month: '09-Sep',
    year: '2028',
    cvv: '123',
    name: 'Des Sample',
    postcode: 'A1A 1A1'
  },

  processingMs: 1400,

  startDate: [2026, 8, 7],   // 7 Sep 2026
  dueInDays: 4,
  cycleDays: 30,

  seedHistory: [
    { date: 'Aug-08-2026', type: 'Manual Payment', amount: 492.71 },
    { date: 'Jul-09-2026', type: 'Manual Payment', amount: 492.71 }
  ]
};

/* ------------------------------------------------------------
   Customer journeys — where the customer is when the demo starts
   ------------------------------------------------------------ */

const JOURNEYS = {
  start: {
    label: 'From start',
    blurb: 'Brand new plan. Earn all 5 easyWins one by one.',
    wins: 0
  },
  third: {
    label: 'At 3rd payment',
    blurb: '3 easyWins earned. The 4th payment is due now.',
    wins: 3
  },
  final: {
    label: 'At final payment',
    blurb: '4 easyWins earned. One more unlocks the reward.',
    wins: 4
  }
};

/* ------------------------------------------------------------
   Dates
   ------------------------------------------------------------ */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function addDays(date, n) {
  const out = new Date(date.getTime());
  out.setDate(out.getDate() + n);
  return out;
}

/** Whole days from b to a. Positive means a is later. */
function dayDiff(a, b) {
  const ms = new Date(a.getFullYear(), a.getMonth(), a.getDate()) -
             new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round(ms / 86400000);
}

function pad2(n) { return String(n).padStart(2, '0'); }

function fmtShort(d) { return MONTHS[d.getMonth()] + ' ' + d.getDate(); }
function fmtStamp(d) { return MONTHS[d.getMonth()] + '-' + pad2(d.getDate()) + '-' + d.getFullYear(); }
function fmtLong(d)  { return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate(); }

/** Fixed phone clock, so it never distracts mid-pitch. */
function clockTime() { return '9:41'; }

/* ------------------------------------------------------------
   Small helpers
   ------------------------------------------------------------ */

function money(n) {
  return n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function txnId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'EW-' + s;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function plural(n, one, many) { return n === 1 ? one : many; }

/** 1st, 2nd, 3rd, 4th … */
function ordinal(n) {
  const suffix = (n % 100 >= 11 && n % 100 <= 13) ? 'th'
               : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return n + suffix;
}

/** Small numbers read warmer spelled out: "five payments to your reward". */
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five',
                      'six', 'seven', 'eight', 'nine', 'ten'];
function word(n) { return NUMBER_WORDS[n] || String(n); }
function Word(n) { const w = word(n); return w.charAt(0).toUpperCase() + w.slice(1); }

/** "2 easyWins" / "1 easyWin" — one per on-time payment */
function wins(n) { return n + ' ' + plural(n, 'easyWin', 'easyWins'); }

const $ = function (sel, root) { return (root || document).querySelector(sel); };

/* ------------------------------------------------------------
   Icons — inline SVG. No emoji (fonts vary), no remote files.
   ------------------------------------------------------------ */

const ICONS = {
  home:    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  build:   '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 16v-4M12 16V8M16 16v-6"/></svg>',
  borrow:  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="13" rx="3"/><path d="M2 11h20"/><circle cx="17.5" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>',
  buy:     '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h3l2.5 12h10L21 7H6"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/></svg>',
  account: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M8 12h8"/></svg>',

  check:   '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.5 5.5L20 6.5"/></svg>',

  win:     '<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.16em"><path d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.65l5.9-.85z"/></svg>',

  dial:    '<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.16em"><path d="M4 18a9 9 0 1 1 16 0"/><path d="M12 14l4-3.5"/><circle cx="12" cy="18" r="1.3" fill="currentColor"/></svg>',

  auto:    '<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.16em"><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.8 4.2v5h-5"/></svg>',

  tick:    '<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.16em"><circle cx="12" cy="12" r="9.2"/><path d="M7.8 12.4l3 3 5.4-5.8"/></svg>'
};

/* ------------------------------------------------------------
   State
   ------------------------------------------------------------ */

let state;

function freshState() {
  const today = new Date(CONFIG.startDate[0], CONFIG.startDate[1], CONFIG.startDate[2]);

  return {
    today: today,
    dueDate: addDays(today, CONFIG.dueInDays),
    paidThisCycle: false,

    journey: 'start',
    loanBalance: CONFIG.loan.balance,   // drops with every payment
    winsEarned: 0,           // counts payments, resets to 0 on a miss
    tierIndex: 0,              // which goal we are working toward
    missed: false,             // last cycle was missed, count reset
    claimed: [],               // easyWins already taken

    autopay: false,

    screen: 'lock',            // lock | dashboard | history
    overlay: null,
    sent: [],                  // notification keys, in order sent
    notifStep: 0,              // how far through the three nudges we are

    amount: '',
    lastPayment: null,
    history: CONFIG.seedHistory.map(function (h) { return Object.assign({}, h); }),

    busy: false,

    // presenter preferences, carried across resets
    sound: true,
    autofill: true,
    fast: false
  };
}

/* ------------------------------------------------------------
   The goal model
   ------------------------------------------------------------ */

function currentTier() {
  return CONFIG.tiers[Math.min(state.tierIndex, CONFIG.tiers.length - 1)];
}

function goal() { return currentTier().goal; }

function winsLeft() { return Math.max(0, goal() - state.winsEarned); }

function milestoneReached() { return state.winsEarned >= goal(); }

/** True once every tier has been claimed. */
function allTiersDone() {
  return state.tierIndex >= CONFIG.tiers.length;
}

/* ------------------------------------------------------------
   Notifications

   Every message names the customer and states how many more easyWins are
   needed to unlock the next reward. One payment earns one easyWin, so that
   count is also the number of payments left. Built at send time from live
   state, so it stays true wherever the presenter jumps.
   ------------------------------------------------------------ */

/** The easyWin this next payment will earn. */
function nextWin() { return Math.min(goal(), state.winsEarned + 1); }

/**
 * Three nudges per journey, sent in order, each a little more actionable:
 *   1. where you stand    2. a date to act on    3. money in the account
 *
 * The wording is built from live state, so the same three read differently in
 * each journey — "5 more unlocks Credit Optimizer" from the start, "1 more"
 * at the final payment. Short lines on purpose: a lock screen is glanced at,
 * not read.
 */
const NOTIFICATIONS = {

  /* ------------------------------------------------------------------
     FIXED COPY — supplied verbatim. Do not rewrite.

     The three nudges are the three days leading up to a payment. Only the
     payment count varies, and it varies by how many easyWins are left:
       5 left = the "from start" journey
       2 left = the "3rd payment" journey
       1 left = the "final payment" journey
     ------------------------------------------------------------------ */

  nudge1: {
    label: '3 days before',
    icon: 'brand',
    title: function () { return CONFIG.customer.first + ', your payment is coming up'; },
    text: function () {
      const n = winsLeft();
      return Word(n) + ' ' + plural(n, 'payment', 'payments') + ' to your reward.';
    }
  },

  nudge2: {
    label: '2 days before',
    icon: 'brand',
    title: function () { return CONFIG.customer.first + ', your payment is in two days'; },
    text: function () {
      return winsLeft() === 1
        ? 'Make your payment to take the final step toward your reward.'
        : 'Make your payment to take the next step toward your reward.';
    }
  },

  nudge3: {
    label: 'Payment day',
    icon: 'brand',
    primary: true,
    title: function () { return CONFIG.customer.first + ', your payment is due today'; },
    text: function () {
      const n = winsLeft();
      if (n === 1) return 'Make your payment today to unlock your reward.';
      if (n === 2) return 'Make your payment today to get one step closer to your reward.';
      return 'Make your payment today to take one step closer to your reward.';
    }
  },

  milestone: {
    label: 'Reward unlocked',
    icon: 'reward',
    primary: true,
    title: function () {
      const t = state.claimed.length ? CONFIG.tiers[state.tierIndex - 1] : currentTier();
      return CONFIG.customer.first + ', ' + t.name + ' is yours';
    },
    text: function () { return 'Free to use. Tap to open it.'; }
  },

  missed: {
    label: 'Back to zero',
    icon: 'brand',
    title: function () { return CONFIG.customer.first + ', you’re back to zero'; },
    text: function () {
      return Word(goal()) + ' payments unlocks ' + currentTier().name + '. Start today.';
    }
  }
};

/** The three nudges, in escalating order. */
const NUDGES = ['nudge1', 'nudge2', 'nudge3'];

/** What the Send button should fire next. */
function nextNotification() {
  if (state.missed) return 'missed';
  if (milestoneReached()) return 'milestone';
  return NUDGES[Math.min(state.notifStep, NUDGES.length - 1)];
}

/** True once all three nudges have been sent for this journey. */
function nudgesExhausted() {
  return !state.missed && !milestoneReached() && state.notifStep >= NUDGES.length;
}

/* ------------------------------------------------------------
   Simulation
   ------------------------------------------------------------ */

function advanceDay() {
  state.today = addDays(state.today, 1);

  // A paid cycle rolls over the day after its due date.
  if (state.paidThisCycle && dayDiff(state.today, state.dueDate) > 0) {
    state.dueDate = addDays(state.dueDate, CONFIG.cycleDays);
    state.paidThisCycle = false;
  }

  // Automatic payments settle on the due date.
  if (state.autopay && !state.paidThisCycle && dayDiff(state.today, state.dueDate) >= 0) {
    payAutomatically();
  }

  // Due date passed unpaid — the count goes back to 0.
  if (!state.paidThisCycle && dayDiff(state.today, state.dueDate) > 0) {
    missPayment();
  }

  render();
}

function missPayment() {
  state.winsEarned = 0;
  state.missed = true;
  state.dueDate = addDays(state.dueDate, CONFIG.cycleDays);
  state.paidThisCycle = false;
}

function recordPayment(amount, type) {
  state.lastPayment = {
    amount: amount,
    type: type,
    date: fmtStamp(state.today),
    id: txnId()
  };
  state.history.unshift({ date: fmtStamp(state.today), type: type, amount: amount });
  state.paidThisCycle = true;

  // The money actually comes off the loan.
  state.loanBalance = Math.max(0, state.loanBalance - amount);
}

/** Balance after a given number of payments — keeps journeys coherent. */
function balanceAfter(n) {
  return Math.max(0, CONFIG.loan.balance - n * CONFIG.loan.payment);
}

function countPayment() {
  state.missed = false;
  state.winsEarned += 1;
}

function completeManualPayment(amount) {
  recordPayment(amount, 'Manual Payment');
  countPayment();
}

function payAutomatically() {
  recordPayment(CONFIG.loan.payment, 'Automatic Payment');
  countPayment();
}

function enrolAutopay() {
  state.autopay = true;
  countPayment();                  // switching on counts as a payment toward the goal
  state.overlay = 'autopayDone';
  render();
  celebrate();
}

function claimReward() {
  const tier = currentTier();

  state.claimed.unshift({
    name: tier.name,
    term: tier.term,
    on: fmtStamp(state.today)
  });

  // Move to the next goal and start a fresh run: the next product takes a
  // full 7 easyWins, not 2 more on top of the 5 already earned.
  state.tierIndex += 1;
  state.winsEarned = 0;

  state.overlay = 'wins';
  render();
}

/* ------------------------------------------------------------
   Presenter: journeys and states
   ------------------------------------------------------------ */

/** Presenter preferences should survive jumping around. */
function carryPreferences(next) {
  if (state) {
    next.sound = state.sound;
    next.autofill = state.autofill;
    next.fast = state.fast;
  }
  return next;
}

function applyJourney(key) {
  const j = JOURNEYS[key];
  if (!j) return;

  state = carryPreferences(freshState());
  state.journey = key;
  state.winsEarned = j.wins;
  state.loanBalance = balanceAfter(j.wins);   // balance matches payments made
  state.screen = 'lock';

  render();
}

const PRESETS = {
  milestone: function () {
    state = carryPreferences(freshState());
    state.winsEarned = CONFIG.tiers[0].goal;
    state.loanBalance = balanceAfter(CONFIG.tiers[0].goal);
    state.screen = 'dashboard';
    state.overlay = 'unlock';
  },

  nextGoal: function () {
    // First product claimed. A fresh run of 7 easyWins unlocks the second.
    state = carryPreferences(freshState());
    state.winsEarned = 0;
    state.loanBalance = balanceAfter(CONFIG.tiers[0].goal);   // 5 already paid
    state.tierIndex = 1;
    state.claimed = [{
      name: CONFIG.tiers[0].name,
      term: CONFIG.tiers[0].term,
      on: fmtStamp(new Date(CONFIG.startDate[0], CONFIG.startDate[1], CONFIG.startDate[2]))
    }];
    state.screen = 'dashboard';
    state.overlay = 'tracker';
  },

  missed: function () {
    state = carryPreferences(freshState());
    state.winsEarned = 0;
    state.loanBalance = balanceAfter(3);   // three paid before the miss
    state.missed = true;
    state.today = addDays(state.dueDate, 1);
    state.dueDate = addDays(state.dueDate, CONFIG.cycleDays);
    state.screen = 'dashboard';
    state.overlay = 'tracker';
  },

  autopay: function () {
    state = carryPreferences(freshState());
    state.autopay = true;
    state.winsEarned = 1;
    state.loanBalance = balanceAfter(1);
    state.screen = 'dashboard';
  }
};

function applyPreset(name) {
  if (!PRESETS[name]) return;
  PRESETS[name]();
  render();
  if (state.overlay === 'unlock') celebrate();
}

/* ------------------------------------------------------------
   Notification sound — synthesised, no file to load
   ------------------------------------------------------------ */

let audioCtx = null;

function ensureAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playChime() {
  if (!state.sound) return;
  const ctx = ensureAudio();
  if (!ctx) return;

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.16;
  master.connect(ctx.destination);

  [{ f: 1174.66, at: 0 }, { f: 1567.98, at: 0.09 }, { f: 2349.32, at: 0.18 }].forEach(function (note) {
    [[note.f, 1], [note.f * 2, 0.28]].forEach(function (pair) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = pair[0];
      const t = now + note.at;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(pair[1], t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  });
}

/* ------------------------------------------------------------
   Views — lock screen
   ------------------------------------------------------------ */

function notifHTML(key, isNewest) {
  const n = NOTIFICATIONS[key];
  const mark = n.icon === 'reward' ? ICONS.win : CONFIG.brand.charAt(0);

  return '' +
  '<div class="notif' + (n.primary ? ' primary' : '') + ' tappable' + (isNewest ? ' arriving' : '') + '"' +
       ' data-act="open-payment">' +
    '<div class="notif-icon ' + n.icon + '">' + mark + '</div>' +
    '<div class="notif-body">' +
      '<div class="notif-top">' +
        '<span class="notif-app">' + esc(CONFIG.notifyApp) + '</span>' +
        '<span class="notif-time">now</span>' +
      '</div>' +
      '<div class="notif-title">' + esc(n.title()) + '</div>' +
      '<div class="notif-text">' + esc(n.text()) + '</div>' +
    '</div>' +
  '</div>';
}

function viewLock() {
  const notifs = state.sent.map(function (key, i) {
    return notifHTML(key, i === state.sent.length - 1);
  }).join('');

  return '' +
  '<div class="screen lock">' +
    '<div class="lock-clock">' +
      '<div class="lock-date">' + fmtLong(state.today) + '</div>' +
      '<div class="lock-time">' + clockTime() + '</div>' +
    '</div>' +
    '<div class="lock-notifs">' + notifs + '</div>' +
    (state.sent.length
      ? '<div class="lock-hint">Tap a notification to open ' + CONFIG.brand + '</div>'
      : '') +
  '</div>';
}

/* ------------------------------------------------------------
   Views — the tracker, shared by the dashboard card and the full screen
   ------------------------------------------------------------ */

function pipsHTML(size) {
  const g = goal();
  let out = '';

  for (let i = 1; i <= g; i++) {
    const done = i <= state.winsEarned;
    const isGoal = i === g;
    const just = !state.missed && i === state.winsEarned;

    let cls = 'pip ' + size;
    if (done) cls += ' done';
    if (isGoal) cls += ' goal';
    if (just) cls += ' just';

    out += '<div class="' + cls + '">' + (isGoal && !done ? ICONS.win : (done ? ICONS.tick : i)) + '</div>';
  }

  // 7 and 10 markers need to sit closer together than 5 do.
  return '<div class="pips ' + (g > 5 ? 'many' : '') + '">' + out + '</div>';
}

function trackerHeadline() {
  const tier = currentTier();

  if (allTiersDone()) {
    return {
      kicker: CONFIG.notifyApp,
      title: 'All rewards unlocked',
      sub: 'Every goal complete.'
    };
  }

  if (milestoneReached()) {
    return {
      kicker: CONFIG.notifyApp,
      title: 'Reward unlocked',
      sub: tier.name + ', ' + tier.term + '.'
    };
  }

  if (state.missed) {
    return {
      kicker: CONFIG.notifyApp,
      title: 'Starting fresh',
      sub: goal() + ' easyWins unlocks ' + tier.name + '.'
    };
  }

  return {
    kicker: CONFIG.notifyApp,
    title: wins(winsLeft()) + ' to go',
    sub: tier.name + ', ' + tier.term + '.'
  };
}

function trackerCardHTML() {
  const head = trackerHeadline();

  return '' +
  '<div class="track-card' + (state.missed ? ' missed' : '') +
       (milestoneReached() ? ' won' : '') + '" data-act="tracker">' +
    '<div class="track-card-top">' +
      '<span class="track-card-title">' + CONFIG.program + '</span>' +
      '<span class="track-card-pill">' + state.winsEarned + ' of ' + goal() + '</span>' +
    '</div>' +
    '<div class="track-card-sub">' + esc(head.sub) + '</div>' +
    pipsHTML('sm') +
    (state.autopay
      ? '<div class="track-card-auto">' + ICONS.auto + ' Automatic payments on — next easyWin ' +
        fmtShort(state.dueDate) + '</div>'
      : '') +
  '</div>';
}

/* ------------------------------------------------------------
   Views — dashboard
   ------------------------------------------------------------ */

/**
 * The headline is the balance still owing, so it drops after every payment.
 * The bar is how much of the original loan has been paid off.
 */
function loanCardHTML(loan, balance) {
  const paid = Math.max(0, loan.original - balance);
  const pct = Math.min(100, Math.round((paid / loan.original) * 100));

  return '' +
  '<div class="loan-card">' +
    '<div class="loan-name">' + esc(loan.name) + '</div>' +
    '<div class="loan-amount">$' + money(balance) + '</div>' +
    '<div class="loan-sub">balance remaining</div>' +
    '<div class="loan-bar"><i style="width:' + pct + '%"></i></div>' +
    '<div class="loan-foot">' +
      '<div><div class="loan-k">$' + loan.original.toLocaleString('en-CA') + '</div>' +
           '<div class="loan-v">' + pct + '% paid off</div></div>' +
      '<div><div class="loan-k">$' + money(loan.payment) + '</div>' +
           '<div class="loan-v">Due ' + fmtShort(state.dueDate) + '</div></div>' +
    '</div>' +
  '</div>';
}

function autopayOfferHTML() {
  if (state.autopay) return '';
  return '' +
  '<div class="offer-card" data-act="autopay">' +
    '<span class="offer-icon">' + ICONS.auto + '</span>' +
    '<div class="offer-body">' +
      '<div class="offer-title">Turn on automatic payments</div>' +
      '<div class="offer-text">Never miss a due date, and earn an easyWin the moment you switch it on.</div>' +
    '</div>' +
    '<span class="offer-badge">+1</span>' +
  '</div>';
}

function claimedStripHTML() {
  if (!state.claimed.length) return '';
  return '' +
  '<div class="claimed-strip" data-act="wins">' +
    '<span class="claimed-icon">' + ICONS.win + '</span>' +
    '<div>' +
      '<div class="claimed-title">Your rewards</div>' +
      '<div class="claimed-text">' + state.claimed.length + ' ' +
        plural(state.claimed.length, 'reward', 'rewards') + ' claimed</div>' +
    '</div>' +
    '<span class="chev">›</span>' +
  '</div>';
}

function tabbarHTML(active) {
  const tabs = [['Home', 'home'], ['Build', 'build'], ['Borrow', 'borrow'], ['Buy', 'buy'], ['Account', 'account']];
  return '<div class="tabbar">' + tabs.map(function (t) {
    return '<button class="tab' + (t[0] === active ? ' on' : '') + '">' + ICONS[t[1]] + '<span>' + t[0] + '</span></button>';
  }).join('') + '</div>';
}

function viewDashboard() {
  return '' +
  '<div class="screen" style="display:flex;flex-direction:column">' +
    '<div style="flex:1;overflow-y:auto">' +

      '<div class="hello">' +
        '<div class="hello-row">' +
          '<span class="hello-name">Hello, ' + esc(CONFIG.customer.first) + '!</span>' +
          '<span class="hello-icons"><span>•</span><span>?</span></span>' +
        '</div>' +
      '</div>' +

      '<div class="carousel-dots"><i class="on"></i><i></i><i></i></div>' +

      '<div class="dash">' +
        '<div class="dash-title">My Dashboard</div>' +

        '<button class="pay-cta" data-act="open-payment">' +
          '<span class="pay-cta-icon">$</span>' +
          '<span class="pay-cta-text">' +
            '<span class="pay-cta-title">Make a Payment</span>' +
            '<span class="pay-cta-sub">' +
              (winsLeft() === 1 ? 'One more easyWin to your reward' : 'Add an extra payment today') +
            '</span>' +
          '</span>' +
          '<span class="chev">›</span>' +
        '</button>' +

        trackerCardHTML() +
        autopayOfferHTML() +
        claimedStripHTML() +

        loanCardHTML(CONFIG.loan, state.loanBalance) +
        loanCardHTML(CONFIG.loan2, CONFIG.loan2.balance) +

        '<div style="height:8px"></div>' +
      '</div>' +

    '</div>' +
    tabbarHTML('Home') +
  '</div>';
}

/* ------------------------------------------------------------
   Views — payment sheets
   ------------------------------------------------------------ */

function viewAmountSheet() {
  const keys = ['1', '2', '3', 'del', '4', '5', '6', 'done', '7', '8', '9', '.', 'blank', '0', 'blank', ','];
  const keypad = keys.map(function (k) {
    if (k === 'blank') return '<button class="key blank" disabled></button>';
    if (k === 'del')   return '<button class="key" data-key="del" aria-label="Delete">⌫</button>';
    if (k === 'done')  return '<button class="key done" data-key="done">Done</button>';
    return '<button class="key" data-key="' + k + '">' + k + '</button>';
  }).join('');

  return '' +
  '<div class="scrim" data-act="close-sheet"></div>' +
  '<div class="sheet">' +
    '<div class="sheet-grip"></div>' +
    '<div class="sheet-body">' +
      '<div class="sheet-h1">Enter Your Payment Amount</div>' +
      '<div class="field-label">Amount</div>' +
      '<div class="amount-box" id="amountBox"></div>' +
      '<div class="quick-amounts">' +
        '<button data-quick="' + CONFIG.loan.payment + '">$' + money(CONFIG.loan.payment) + ' (full)</button>' +
        '<button data-quick="100">$100</button>' +
        '<button data-quick="250">$250</button>' +
      '</div>' +
      '<div style="height:22px"></div>' +
      '<button class="btn-primary" id="amountNext" data-act="to-form">Next</button>' +
    '</div>' +
    '<div class="keypad"><div class="keypad-grid">' + keypad + '</div></div>' +
  '</div>';
}

function amountValue() { return state.amount === '' ? 0 : (parseFloat(state.amount) || 0); }

function renderAmountBox() {
  const box = $('#amountBox');
  if (!box) return;
  box.innerHTML =
    '<span class="cur">' + CONFIG.currency + '</span>' +
    '<span class="caret"></span>' +
    (state.amount === ''
      ? '<span class="val placeholder">0.00</span>'
      : '<span class="val">' + esc(state.amount) + '</span>');
  const next = $('#amountNext');
  if (next) next.disabled = amountValue() <= 0;
}

function pressKey(k) {
  if (k === 'del') {
    state.amount = state.amount.slice(0, -1);
  } else if (k === 'done') {
    if (amountValue() > 0) goForm();
    return;
  } else if (k === '.' || k === ',') {
    if (state.amount.indexOf('.') === -1 && state.amount !== '') state.amount += '.';
  } else {
    const dot = state.amount.indexOf('.');
    if (dot !== -1 && state.amount.length - dot > 2) return;
    if (state.amount.replace('.', '').length >= 9) return;
    state.amount += k;
  }
  renderAmountBox();
}

function viewFormSheet() {
  const c = CONFIG.testCard;
  const pre = state.autofill;

  const monthOpts = ['-Month-'].concat(MONTHS.map(function (m, i) { return pad2(i + 1) + '-' + m; }))
    .map(function (m) { return '<option' + (pre && m === c.month ? ' selected' : '') + '>' + m + '</option>'; }).join('');

  const yearOpts = ['2026', '2027', '2028', '2029', '2030']
    .map(function (y) { return '<option' + (y === c.year ? ' selected' : '') + '>' + y + '</option>'; }).join('');

  return '' +
  '<div class="scrim" data-act="close-sheet"></div>' +
  '<div class="sheet tall">' +
    '<div class="sheet-body">' +
      '<button class="sheet-back" data-act="to-amount">←</button>' +
      '<div class="form-amount">Payment Amount: ' + CONFIG.currency + ' ' + money(amountValue()) + '</div>' +

      (pre ? '' : '<button class="autofill" data-act="autofill">Autofill test card details</button>') +

      '<div class="f-row">' +
        '<label class="f-label">Payment Type:*</label>' +
        '<select class="f-select" id="fType">' +
          '<option>Debit MasterCard</option><option>Visa Debit</option><option>Credit Card</option>' +
        '</select>' +
      '</div>' +

      '<div class="f-row" id="rowNumber">' +
        '<label class="f-label">Card Number:*</label>' +
        '<input class="f-input" id="fNumber" inputmode="numeric" value="' + (pre ? c.number : '') + '">' +
        '<div class="f-error">Enter a valid card number.</div>' +
      '</div>' +

      '<div class="f-row" id="rowExpiry">' +
        '<label class="f-label">Expiry Date:*</label>' +
        '<div class="f-two">' +
          '<select class="f-select" id="fMonth">' + monthOpts + '</select>' +
          '<select class="f-select" id="fYear">' + yearOpts + '</select>' +
        '</div>' +
        '<div class="f-error">Select an expiry month.</div>' +
      '</div>' +

      '<div class="f-row" id="rowCvv">' +
        '<label class="f-label">CVV:*</label>' +
        '<div class="f-cvv">' +
          '<input class="f-input" id="fCvv" inputmode="numeric" maxlength="4" value="' + (pre ? c.cvv : '') + '">' +
          '<span class="f-link" data-act="cvv-help">What\'s this?</span>' +
        '</div>' +
        '<div class="cvv-help" id="cvvHelp" hidden>The 3-digit code on the back of your card.</div>' +
        '<div class="f-error">Enter the 3-digit code.</div>' +
      '</div>' +

      '<div class="f-row" id="rowName">' +
        '<label class="f-label">Cardholder Name:*</label>' +
        '<input class="f-input" id="fName" value="' + (pre ? esc(c.name) : '') + '">' +
        '<div class="f-error">Enter the cardholder name.</div>' +
      '</div>' +

      '<div class="f-row" id="rowPost">' +
        '<label class="f-label">Postcode:*</label>' +
        '<input class="f-input" id="fPost" value="' + (pre ? esc(c.postcode) : '') + '">' +
        '<div class="f-error">Enter a postcode.</div>' +
      '</div>' +

      '<div style="height:6px"></div>' +
      '<button class="btn-primary" data-act="pay">Pay Now</button>' +
      '<div class="ssl-note">ABOUT SSL CERTIFICATES</div>' +
    '</div>' +
  '</div>';
}

function validateForm() {
  const checks = [
    ['rowNumber', function () { return $('#fNumber').value.replace(/\s/g, '').length >= 12; }],
    ['rowExpiry', function () { return $('#fMonth').value !== '-Month-'; }],
    ['rowCvv',    function () { return $('#fCvv').value.trim().length >= 3; }],
    ['rowName',   function () { return $('#fName').value.trim().length > 0; }],
    ['rowPost',   function () { return $('#fPost').value.trim().length > 0; }]
  ];

  let ok = true;
  let firstBad = null;

  checks.forEach(function (chk) {
    const row = $('#' + chk[0]);
    const good = chk[1]();
    row.classList.toggle('bad', !good);
    if (!good && !firstBad) firstBad = row;
    if (!good) ok = false;
  });

  if (firstBad) firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return ok;
}

/* ------------------------------------------------------------
   Views — processing and success
   ------------------------------------------------------------ */

function viewProcessing() {
  return '' +
  '<div class="processing">' +
    '<div class="processing-inner">' +
      '<div class="spinner"></div>' +
      '<div class="processing-text">Processing your payment</div>' +
      '<div class="processing-sub">This only takes a moment</div>' +
    '</div>' +
  '</div>';
}

function viewSuccess() {
  // Defensive: the receipt needs a payment. If anything ever lands here
  // without one, show the tracker rather than throwing.
  if (!state.lastPayment) return viewTracker();

  const p = state.lastPayment;
  const left = winsLeft();

  // One short line — this box used to wrap onto two.
  const banner = milestoneReached()
    ? 'Reward unlocked'
    : 'easyWin ' + state.winsEarned + ' of ' + goal() + ' · ' + left + ' to go';

  return '' +
  '<div class="scrim"></div>' +
  '<div class="sheet tall">' +
    '<div class="sheet-body">' +
      '<div class="success-mark">' + ICONS.check + '</div>' +
      '<div class="success-h1">Payment complete</div>' +
      '<div class="success-sub">Thanks, ' + esc(CONFIG.customer.first) + '</div>' +

      '<div class="receipt">' +
        '<div class="receipt-row"><span class="receipt-k">Reference</span><span class="receipt-v">' + esc(p.id) + '</span></div>' +
        '<div class="receipt-row"><span class="receipt-k">Date</span><span class="receipt-v">' + esc(p.date) + '</span></div>' +
        '<div class="receipt-row"><span class="receipt-k">Applied to</span><span class="receipt-v">' + esc(CONFIG.loan.name) + '</span></div>' +
        '<div class="receipt-row"><span class="receipt-k">Amount</span><span class="receipt-v big">' + CONFIG.currency + ' ' + money(p.amount) + '</span></div>' +
      '</div>' +

      '<div class="win-banner"><span class="win-banner-mark">' + ICONS.win + '</span>' +
        '<span>' + esc(banner) + '</span></div>' +

      '<button class="btn-primary" data-act="after-payment">' +
        (milestoneReached() ? 'See your reward' : 'See your ' + CONFIG.program) +
      '</button>' +
      '<button class="btn-ghost" data-act="history">Go to payment history</button>' +
    '</div>' +
  '</div>';
}

/* ------------------------------------------------------------
   Views — tracker screen
   ------------------------------------------------------------ */

function viewTracker() {
  const head = trackerHeadline();
  const tier = currentTier();
  const pct = Math.min(100, Math.round((state.winsEarned / goal()) * 100));

  let cta, secondary = '<button class="btn-ghost" data-act="dashboard">Back to dashboard</button>';

  if (milestoneReached() && !allTiersDone()) {
    cta = '<button class="btn-primary" data-act="unlock">Claim your reward</button>';
  } else if (allTiersDone()) {
    cta = '<button class="btn-primary" data-act="wins">See your ' + CONFIG.program + '</button>';
  } else if (!state.autopay) {
    cta = '<button class="btn-primary" data-act="autopay">Turn on automatic payments</button>';
  } else {
    cta = '<button class="btn-primary" data-act="dashboard">Back to dashboard</button>';
    secondary = '';
  }

  return '' +
  '<div class="scrim"></div>' +
  '<div class="sheet tall" style="background:var(--app-bg)">' +
    '<div class="sheet-body" style="padding:0">' +

      '<div class="tracker-hero' + (state.missed ? ' missed' : '') +
           (milestoneReached() ? ' won' : '') + '">' +
        '<div class="tracker-kicker">' + esc(head.kicker) + '</div>' +
        '<div class="tracker-h1">' + esc(head.title) + '</div>' +
        '<div class="tracker-sub">' + esc(head.sub) + '</div>' +
      '</div>' +

      '<div class="tracker-body">' +

        '<div class="track-wrap">' +
          '<div class="track-top">' +
            '<span class="track-label">easyWins earned</span>' +
            '<span class="track-count">' + state.winsEarned + ' of ' + goal() + '</span>' +
          '</div>' +
          '<div class="track">' + pipsHTML('lg') + '</div>' +
          '<div class="track-bar"><i data-fill="' + pct + '"></i></div>' +
        '</div>' +

        '<div class="reward-card' + (milestoneReached() ? ' unlocked' : '') + '">' +
          '<div class="reward-emoji">' + ICONS.dial + '</div>' +
          '<div>' +
            '<div class="reward-title">' + esc(tier.name) + '</div>' +
            '<div class="reward-text">' + esc(tier.tagline) + ' · ' + esc(tier.term) + '</div>' +
          '</div>' +
        '</div>' +

        goalLadderHTML() +

        (state.missed
          ? '<div class="nudge">A missed payment resets your easyWins. ' +
            goal() + ' in a row unlocks ' + tier.name + '.</div>'
          : '<div class="nudge">Automatic payments never miss a due date.</div>') +

        '<div class="tracker-actions">' + cta + secondary + '</div>' +
        '<div style="height:16px"></div>' +

      '</div>' +
    '</div>' +
  '</div>';
}

/** The full ladder of goals, so the next one is always visible. */
function goalLadderHTML() {
  const rows = CONFIG.tiers.map(function (t, i) {
    const claimed = i < state.tierIndex;
    const active = i === state.tierIndex;

    return '<div class="ladder-row' + (claimed ? ' claimed' : '') + (active ? ' active' : '') + '">' +
             '<span class="ladder-mark">' + (claimed ? ICONS.tick : ICONS.win) + '</span>' +
             '<span class="ladder-goal">' + t.goal + ' easyWins</span>' +
             '<span class="ladder-name">' + esc(t.name) + '</span>' +
             '<span class="ladder-term">' + esc(t.term) + '</span>' +
           '</div>';
  }).join('');

  return '<div class="ladder"><div class="ladder-title">Your goals</div>' + rows + '</div>';
}

/* ------------------------------------------------------------
   Views — unlock and the claimed list
   ------------------------------------------------------------ */

function viewUnlock() {
  const tier = currentTier();

  return '' +
  '<div class="scrim"></div>' +
  '<div class="sheet tall unlock-sheet">' +
    '<div class="sheet-body">' +
      '<div class="unlock-badge">' + ICONS.win + '</div>' +
      '<div class="unlock-kicker">' + wins(state.winsEarned) + ' earned</div>' +
      '<div class="unlock-h1">Reward unlocked</div>' +
      '<div class="unlock-sub">Nice work, ' + esc(CONFIG.customer.first) + '.</div>' +

      '<div class="unlock-prize">' +
        '<div class="unlock-prize-name">' + esc(tier.name) + '</div>' +
        '<div class="unlock-prize-term">' + esc(tier.term) + '</div>' +
        '<div class="unlock-prize-text">' + esc(tier.blurb) + '</div>' +
      '</div>' +

      '<button class="btn-primary" data-act="claim">Claim my reward</button>' +
      '<button class="btn-ghost" data-act="tracker">Not right now</button>' +
    '</div>' +
  '</div>';
}

function viewWins() {
  const rows = state.claimed.length
    ? state.claimed.map(function (c) {
        return '<div class="win-row">' +
                 '<span class="win-row-icon">' + ICONS.win + '</span>' +
                 '<div class="win-row-body">' +
                   '<div class="win-row-name">' + esc(c.name) + '</div>' +
                   '<div class="win-row-meta">' + esc(c.term) + ' · claimed ' + esc(c.on) + '</div>' +
                 '</div>' +
                 '<span class="win-row-state">Active</span>' +
               '</div>';
      }).join('')
    : '<div class="win-empty">Nothing claimed yet. Reach ' + wins(goal()) +
      ' and your first reward lands here.</div>';

  const next = allTiersDone()
    ? 'Every goal complete.'
    : 'Next goal: <b>' + wins(winsLeft()) + ' to go</b> for ' + esc(currentTier().name);

  return '' +
  '<div class="scrim"></div>' +
  '<div class="sheet tall" style="background:var(--app-bg)">' +
    '<div class="sheet-body">' +
      '<div class="wins-h1">Your rewards</div>' +
      '<div class="wins-sub">Unlocked with your ' + CONFIG.program + ' and claimed.</div>' +
      '<div class="win-list">' + rows + '</div>' +
      '<div class="wins-next">' + next + '</div>' +
      goalLadderHTML() +
      '<div style="height:16px"></div>' +
      '<button class="btn-primary" data-act="dashboard">Back to dashboard</button>' +
    '</div>' +
  '</div>';
}

/* ------------------------------------------------------------
   Views — automatic payments
   ------------------------------------------------------------ */

function viewAutopay() {
  return '' +
  '<div class="scrim" data-act="close-sheet"></div>' +
  '<div class="sheet tall">' +
    '<div class="sheet-body">' +
      '<button class="sheet-back" data-act="dashboard">←</button>' +

      '<div class="auto-icon">' + ICONS.auto + '</div>' +
      '<div class="auto-h1">Automatic payments</div>' +
      '<div class="auto-sub">' +
        CONFIG.currency + ' ' + money(CONFIG.loan.payment) + ' on each due date, from your card ending 0007.' +
      '</div>' +

      '<div class="auto-points">' +
        '<div class="auto-point"><span>' + ICONS.tick + '</span>Every due date earns an easyWin</div>' +
        '<div class="auto-point"><span>' + ICONS.tick + '</span>Never reset by a missed date</div>' +
        '<div class="auto-point"><span>' + ICONS.tick + '</span>Cancel any time</div>' +
      '</div>' +

      '<div class="auto-bonus">' +
        '<span class="auto-bonus-mark">' + ICONS.win + '</span>' +
        '<span>Switch on now and earn <b>an easyWin today</b></span>' +
      '</div>' +

      '<button class="btn-primary" data-act="enrol-autopay">Turn on automatic payments</button>' +
      '<button class="btn-ghost" data-act="dashboard">Not now</button>' +
    '</div>' +
  '</div>';
}

function viewAutopayDone() {
  return '' +
  '<div class="scrim"></div>' +
  '<div class="sheet tall">' +
    '<div class="sheet-body">' +
      '<div class="success-mark">' + ICONS.check + '</div>' +
      '<div class="success-h1">You are all set</div>' +
      '<div class="success-sub">' +
        CONFIG.currency + ' ' + money(CONFIG.loan.payment) + ' will be taken on ' + fmtShort(state.dueDate) +
      '</div>' +

      '<div class="win-banner"><span class="win-banner-mark">' + ICONS.win + '</span>' +
        '<span>easyWin ' + state.winsEarned + ' of ' + goal() + ' · ' + winsLeft() + ' to go</span></div>' +

      '<div class="nudge">From here it runs itself. Every due date earns an easyWin.</div>' +

      '<button class="btn-primary" data-act="tracker">See your ' + CONFIG.program + '</button>' +
      '<button class="btn-ghost" data-act="dashboard">Back to dashboard</button>' +
    '</div>' +
  '</div>';
}

/* ------------------------------------------------------------
   Views — payment history
   ------------------------------------------------------------ */

function viewHistory() {
  const last = state.history[0];

  const rows = state.history.map(function (h, i) {
    return '<div class="hist-row' + (i === 0 && state.lastPayment ? ' fresh' : '') + '">' +
             '<div>' +
               '<div class="hist-row-date">' + esc(h.date) + '</div>' +
               '<div class="hist-row-type">' + esc(h.type) + '</div>' +
             '</div>' +
             '<div class="hist-row-amt">$' + money(h.amount) + '</div>' +
           '</div>';
  }).join('');

  return '' +
  '<div class="screen">' +
    '<div class="hist-hero">' +
      '<button class="hist-back" data-act="dashboard">←</button>' +
      '<div class="hist-h1">Last Payment</div>' +
      '<div class="hist-date">' + esc(last.date) + '</div>' +
      '<div class="hist-amount">$' + money(last.amount) + '</div>' +
    '</div>' +
    '<div class="hist-panel">' +
      '<div class="hist-panel-top">' +
        '<span class="hist-panel-title">Payment History</span>' +
        '<span class="info-dot">i</span>' +
      '</div>' +
      '<div class="hist-list">' + rows + '</div>' +
    '</div>' +
  '</div>';
}

/* ------------------------------------------------------------
   Render
   ------------------------------------------------------------ */

const OVERLAY_VIEWS = {
  amount:      viewAmountSheet,
  form:        viewFormSheet,
  processing:  viewProcessing,
  success:     viewSuccess,
  tracker:     viewTracker,
  unlock:      viewUnlock,
  wins:        viewWins,
  autopay:     viewAutopay,
  autopayDone: viewAutopayDone
};

function render() {
  let html = state.screen === 'lock'    ? viewLock()
           : state.screen === 'history' ? viewHistory()
           : viewDashboard();

  if (state.overlay && OVERLAY_VIEWS[state.overlay]) html += OVERLAY_VIEWS[state.overlay]();

  $('#viewport').innerHTML = html;
  setText('#sbTime', clockTime());

  paintChrome();
  if (state.overlay === 'amount') renderAmountBox();

  const fill = $('.track-bar i');
  if (fill) requestAnimationFrame(function () { fill.style.width = fill.dataset.fill + '%'; });

  updateCaption();
  syncPresenter();
}

/** The status bar and home indicator float over the screen, so each needs to
    be light or dark depending on what sits behind it. They can differ. */
function paintChrome() {
  const paleSheet = ['form', 'success', 'wins', 'autopay', 'autopayDone', 'processing']
    .indexOf(state.overlay) !== -1;
  const darkTopSheet = ['tracker', 'unlock'].indexOf(state.overlay) !== -1;

  const sb = $('#statusbar');
  const hi = $('#homeIndicator');
  if (sb) sb.classList.toggle('dark', paleSheet);
  if (hi) hi.classList.toggle('dark', paleSheet || darkTopSheet || state.screen === 'history');
}

function updateCaption() {
  const map = {
    amount:      'Enter an amount',
    form:        'Card details pre-filled — tap Pay Now',
    processing:  'Processing…',
    success:     'Payment complete — easyWin earned',
    tracker:     'easyWins earned so far',
    unlock:      'Reward unlocked',
    wins:        'Rewards claimed so far',
    autopay:     'Automatic payments',
    autopayDone: 'Automatic payments on'
  };

  const base = state.screen === 'lock'
    ? (state.sent.length ? 'Tap a notification' : 'Pick a journey, then send a notification')
    : state.screen === 'history' ? 'Payment history' : 'Dashboard';

  setText('#phoneCaption', map[state.overlay] || base);
}

/* ------------------------------------------------------------
   Celebration — kept under a second
   ------------------------------------------------------------ */

function celebrate() {
  const colors = ['#7ac143', '#4caf50', '#1b8acb', '#0b4e8f', '#f5c33b'];
  const layer = document.createElement('div');
  layer.className = 'confetti';

  for (let i = 0; i < 28; i++) {
    const piece = document.createElement('i');
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = (0.65 + Math.random() * 0.25) + 's';
    piece.style.animationDelay = (Math.random() * 0.12) + 's';
    piece.style.setProperty('--spin', (Math.random() * 700 - 350) + 'deg');
    if (i % 3 === 0) piece.style.borderRadius = '50%';
    layer.appendChild(piece);
  }

  const screen = $('#phoneScreen');
  if (screen) screen.appendChild(layer);
  setTimeout(function () { layer.remove(); }, 1000);
}

/* ------------------------------------------------------------
   Navigation
   ------------------------------------------------------------ */

function goDashboard() { state.screen = 'dashboard'; state.overlay = null; render(); }
function goTracker()   { state.screen = 'dashboard'; state.overlay = 'tracker'; render(); }
function goUnlock()    { state.screen = 'dashboard'; state.overlay = 'unlock'; render(); celebrate(); }
function goWins()      { state.screen = 'dashboard'; state.overlay = 'wins'; render(); }
function goAutopay()   { state.screen = 'dashboard'; state.overlay = 'autopay'; render(); }
function goHistory()   { state.screen = 'history'; state.overlay = null; render(); }

function goAmount() {
  state.screen = 'dashboard';
  state.overlay = 'amount';
  if (state.amount === '') state.amount = String(CONFIG.loan.payment);
  render();
}

function goForm() {
  if (amountValue() <= 0) return;
  state.overlay = 'form';
  render();
}

function openFromNotification() {
  if (state.screen === 'lock') {
    state.screen = 'dashboard';
    state.overlay = null;
    render();
    requestAnimationFrame(goAmount);   // paint the dashboard behind the sheet first
  } else {
    goAmount();
  }
}

function payNow() {
  if (state.busy) return;
  if (!validateForm()) return;

  const amount = amountValue();

  function settle() {
    state.busy = false;
    completeManualPayment(amount);
    state.overlay = 'success';
    render();
    celebrate();
  }

  if (state.fast) { settle(); return; }

  state.busy = true;
  state.overlay = 'processing';
  render();
  setTimeout(settle, CONFIG.processingMs);
}

function afterPayment() {
  if (milestoneReached() && !allTiersDone()) goUnlock();
  else goTracker();
}

/* ------------------------------------------------------------
   Actions
   ------------------------------------------------------------ */

const ACTIONS = {
  'open-payment':  openFromNotification,
  'close-sheet':   function () { state.overlay = null; render(); },
  'to-amount':     goAmount,
  'to-form':       goForm,
  'pay':           payNow,
  'after-payment': afterPayment,
  'tracker':       goTracker,
  'unlock':        goUnlock,
  'claim':         claimReward,
  'wins':          goWins,
  'autopay':       goAutopay,
  'enrol-autopay': enrolAutopay,
  'history':       goHistory,
  'dashboard':     goDashboard,
  'autofill':      function () {
                     state.autofill = true;
                     const box = $('#optAutofill');
                     if (box) box.checked = true;
                     render();
                   },
  'cvv-help':      function () { const h = $('#cvvHelp'); if (h) h.hidden = !h.hidden; }
};

document.addEventListener('click', function (e) {
  const keyEl = e.target.closest('[data-key]');
  if (keyEl) { pressKey(keyEl.dataset.key); return; }

  const quickEl = e.target.closest('[data-quick]');
  if (quickEl) { state.amount = quickEl.dataset.quick; renderAmountBox(); return; }

  const actEl = e.target.closest('[data-act]');
  if (actEl && ACTIONS[actEl.dataset.act]) { ACTIONS[actEl.dataset.act](); return; }

  const journeyEl = e.target.closest('[data-journey]');
  if (journeyEl) { applyJourney(journeyEl.dataset.journey); return; }

  const presetEl = e.target.closest('[data-preset]');
  if (presetEl) { applyPreset(presetEl.dataset.preset); return; }

  const notifEl = e.target.closest('[data-notif]');
  if (notifEl) { sendNotification(notifEl.dataset.notif); return; }
});

/* ------------------------------------------------------------
   Notification sender
   ------------------------------------------------------------ */

/**
 * Only one notification is on the lock screen at a time. Each new one replaces
 * the last, so the sequence reads as messages arriving over days as the due
 * date approaches rather than as a stack piling up.
 */
function sendNotification(key) {
  // Sending a specific one does not consume the sequence.
  if (!key && nudgesExhausted()) return;

  const chosen = key || nextNotification();

  function show() {
    state.screen = 'lock';
    state.overlay = null;
    state.sent = [chosen];            // replaces, never appends
    if (!key && !state.missed && !milestoneReached()) state.notifStep += 1;
    playChime();
    render();
  }

  // Let the one on screen slide away first.
  const current = $('.notif');
  if (current && state.screen === 'lock' && !state.overlay) {
    current.classList.add('leaving');
    setTimeout(show, 170);
  } else {
    show();
  }
}

function clearNotifications() {
  state.sent = [];
  state.notifStep = 0;
  render();
}

/* ------------------------------------------------------------
   Presenter panel
   ------------------------------------------------------------ */

/** Write text only if the element exists, so a missing control never throws. */
function setText(selector, text) {
  const el = $(selector);
  if (el) el.textContent = text;
}

function syncPresenter() {
  setText('#simDate', fmtLong(state.today) + ', ' + state.today.getFullYear());
  setText('#simDue', fmtShort(state.dueDate));
  setText('#simCount', state.winsEarned + ' / ' + goal());
  setText('#simGoal', allTiersDone() ? 'all claimed' : currentTier().name);
  setText('#simState', state.missed ? 'Missed — reset to 0'
                     : milestoneReached() ? 'Reward ready'
                     : wins(winsLeft()) + ' to go');
  setText('#simAuto', state.autopay ? 'On' : 'Off');

  // Tell the presenter which of the three nudges fires next.
  const done = nudgesExhausted();
  setText('#sendNotifCount', done
    ? 'All 3 sent — press Clear'
    : 'Next: ' + NOTIFICATIONS[nextNotification()].label);

  const btn = $('#sendNotifBtn');
  if (btn) btn.disabled = done;

  const sel = $('#journeySelect');
  if (sel && sel.value !== state.journey) sel.value = state.journey;

  setText('#journeyBlurb', JOURNEYS[state.journey] ? JOURNEYS[state.journey].blurb : '');
}

function togglePresenter(force) {
  const p = $('#presenter');
  if (p) p.classList.toggle('open', force === undefined ? !p.classList.contains('open') : force);
}

function resetEverything() {
  state = carryPreferences(freshState());
  render();
}

/** Bind only if present — a missing control must never take the app down. */
function on(selector, event, handler) {
  const el = $(selector);
  if (el) el.addEventListener(event, handler);
}

function wireControls() {
  on('#sendNotifBtn',  'click', function () { sendNotification(); });
  on('#clearNotifBtn', 'click', clearNotifications);
  on('#advanceDayBtn', 'click', advanceDay);
  on('#resetBtn',      'click', resetEverything);
  on('#presenterOpen', 'click', function () { togglePresenter(true); });
  on('#presenterClose','click', function () { togglePresenter(false); });

  on('#journeySelect', 'change', function (e) { applyJourney(e.target.value); });

  on('#optAutofill', 'change', function (e) {
    state.autofill = e.target.checked;
    if (state.overlay === 'form') render();
  });
  on('#optSound', 'change', function (e) { state.sound = e.target.checked; });
  on('#optFast',  'change', function (e) { state.fast = e.target.checked; });
}

/* Number keys: 1-3 journeys, 4-7 states. */
const KEY_ACTIONS = {
  '1': function () { applyJourney('start'); },
  '2': function () { applyJourney('third'); },
  '3': function () { applyJourney('final'); },
  '4': function () { applyPreset('milestone'); },
  '5': function () { applyPreset('nextGoal'); },
  '6': function () { applyPreset('missed'); },
  '7': function () { applyPreset('autopay'); }
};

document.addEventListener('keydown', function (e) {
  if (e.target.matches('input, select, textarea')) return;

  if (KEY_ACTIONS[e.key]) { KEY_ACTIONS[e.key](); return; }

  const k = e.key.toLowerCase();
  if (k === 'n') sendNotification();
  if (k === 'd') advanceDay();
  if (k === 'c') clearNotifications();
  if (k === 'p') togglePresenter();
  if (k === 'r') resetEverything();
  if (k === 'escape' && state.overlay) { state.overlay = null; render(); }
});

/* ------------------------------------------------------------
   Fit the phone to the window

   Not a responsive layout: fixed proportions, scaled uniformly so an
   unexpected projector resolution cannot clip the frame.
   ------------------------------------------------------------ */

const WRAP_H = 852 + 18 + 20;
const WRAP_W = 393;

function fitPhone() {
  const wrap = $('#phoneWrap');
  if (!wrap) return;
  const scale = Math.min(1, (window.innerHeight - 32) / WRAP_H, (window.innerWidth - 40) / WRAP_W);
  wrap.style.transform = 'translate(-50%, -50%) scale(' + Math.max(0.3, scale) + ')';
}

window.addEventListener('resize', fitPhone);

/* ------------------------------------------------------------
   Boot — draw and scale first, then wire controls
   ------------------------------------------------------------ */

function boot() {
  state = freshState();
  render();
  fitPhone();
  wireControls();
}

try {
  boot();
} catch (err) {
  const banner = document.createElement('div');
  banner.style.cssText =
    'position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:999;' +
    'background:#7a2d2d;color:#fff;padding:12px 18px;border-radius:10px;' +
    'font:13px/1.5 system-ui,sans-serif;max-width:560px';
  banner.textContent = 'Prototype failed to start: ' + err.message +
    ' — try a hard refresh (Ctrl+Shift+R).';
  document.body.appendChild(banner);
  throw err;
}
