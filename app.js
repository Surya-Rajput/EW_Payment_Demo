/* ============================================================
   easyWins — clickable pitch prototype

   No backend, no network, no persistence. All state is the plain object
   below, held in memory. Everything the presenter can do is a function in
   this file. Plain code on purpose: this is meant to be read, not extended.

   The journey:
     lock screen -> notification -> payment -> easyWin earned
       -> milestone -> reward unlocked -> claimed
       -> next cycle missed -> grace window -> recovery -> streak saved
   ============================================================ */

'use strict';

/* ------------------------------------------------------------
   Config — every demo-tunable value lives here
   ------------------------------------------------------------ */

const CONFIG = {
  brand: 'goeasy',
  program: 'easyWins',

  // Obviously fictional. Never use anything that could read as a real customer.
  customer: { first: 'Alex', full: 'Alex Sample' },

  currency: 'CAD',
  goal: 5,              // easyWins needed for a milestone
  graceDays: 5,         // recovery window after a missed due date

  reward: {
    name: 'CreditGuard Plus',
    tagline: 'Credit monitoring and score alerts',
    term: '1 month free',
    blurb: 'Daily score updates and alerts if anything changes on your file. Free for one month, then cancel any time.'
  },

  loan: {
    name: 'Unsecured Personal Loan',
    principal: '$15,100',
    balance: '$17,857.69',
    payment: 492.71,
    progress: 18
  },

  loan2: {
    name: 'Powersports Financing',
    principal: '$25,000',
    balance: '$15,000',
    payment: 500.00,
    progress: 25
  },

  testCard: {
    type: 'Debit MasterCard',
    number: '5100 2700 0000 0007',   // documented MasterCard test number
    month: '09-Sep',
    year: '2028',
    cvv: '123',
    name: 'Alex Sample',
    postcode: 'A1A 1A1'
  },

  // How long the payment processing screen shows, in ms.
  // Fast mode in the presenter panel skips it entirely.
  processingMs: 1400,

  // Simulated clock. The presenter advances this a day at a time.
  startDate: [2026, 8, 7],   // 7 Sep 2026
  dueInDays: 4,              // first due date, relative to the start date
  cycleDays: 30,

  seedHistory: [
    { date: 'Aug-08-2026', type: 'Manual Payment', amount: 492.71 },
    { date: 'Jul-09-2026', type: 'Manual Payment', amount: 492.71 },
    { date: 'Jun-08-2026', type: 'Manual Payment', amount: 492.71 }
  ]
};

/* ------------------------------------------------------------
   Dates — plain helpers over a simulated "today"
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

function fmtShort(d)  { return MONTHS[d.getMonth()] + ' ' + d.getDate(); }              // Sep 11
function fmtStamp(d)  { return MONTHS[d.getMonth()] + '-' + pad2(d.getDate()) + '-' + d.getFullYear(); }
function fmtLong(d)   { return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate(); }

/** The phone clock. Fixed, so it never distracts mid-pitch. */
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

const $  = function (sel, root) { return (root || document).querySelector(sel); };
const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

/* ------------------------------------------------------------
   Icons — drawn inline. No emoji (fonts vary by machine), no remote files.
   ------------------------------------------------------------ */

const ICONS = {
  home:    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  build:   '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 16v-4M12 16V8M16 16v-6"/></svg>',
  borrow:  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="13" rx="3"/><path d="M2 11h20"/><circle cx="17.5" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>',
  buy:     '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h3l2.5 12h10L21 7H6"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/></svg>',
  account: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M8 12h8"/></svg>',

  check:   '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.5 5.5L20 6.5"/></svg>',

  win:     '<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.16em"><path d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.65l5.9-.85z"/></svg>',

  pause:   '<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="currentColor" style="vertical-align:-.16em"><rect x="8" y="6" width="3.2" height="12" rx="1.6"/><rect x="13" y="6" width="3.2" height="12" rx="1.6"/></svg>',

  shield:  '<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.16em"><path d="M12 3l7.5 3v5.4c0 4.5-3.1 8.3-7.5 9.6-4.4-1.3-7.5-5.1-7.5-9.6V6z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.4"/></svg>',

  auto:    '<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.16em"><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.8 4.2v5h-5"/></svg>',

  tick:    '<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.16em"><circle cx="12" cy="12" r="9.2"/><path d="M7.8 12.4l3 3 5.4-5.8"/></svg>'
};

/* ------------------------------------------------------------
   Notification variants

   Every message names the customer and cites their actual progress, so
   nothing reads like a mass send. Text is built at send time from live
   state, so it stays true whatever the presenter has jumped to.
   ------------------------------------------------------------ */

const NOTIFICATIONS = {

  payday: {
    label: 'Payday morning',
    app: function () { return CONFIG.brand; },
    icon: 'brand',
    primary: true,
    title: function () { return 'Morning ' + CONFIG.customer.first + ' — your pay just landed'; },
    text: function () {
      const next = Math.min(CONFIG.goal, state.wins + 1);
      return 'Clear ' + CONFIG.currency + ' ' + money(CONFIG.loan.payment) + ' today and that is easyWin ' +
             next + ' of ' + CONFIG.goal + '. Takes about a minute.';
    }
  },

  due: {
    label: 'Two days before due',
    app: function () { return CONFIG.brand; },
    icon: 'brand',
    title: function () {
      const left = Math.max(0, CONFIG.goal - state.wins - 1);
      return left === 0
        ? CONFIG.customer.first + ', this one unlocks your reward'
        : CONFIG.customer.first + ', one payment from easyWin ' + Math.min(CONFIG.goal, state.wins + 1);
    },
    text: function () {
      const left = Math.max(0, CONFIG.goal - state.wins - 1);
      return CONFIG.currency + ' ' + money(CONFIG.loan.payment) + ' is due ' + fmtShort(state.dueDate) + '. ' +
             (left === 0
               ? 'Pay it and ' + CONFIG.reward.name + ' is yours.'
               : 'Pay it and you are ' + left + ' away from ' + CONFIG.reward.name + '.');
    }
  },

  milestone: {
    label: 'Milestone reached',
    app: function () { return CONFIG.program; },
    icon: 'reward',
    primary: true,
    title: function () { return 'That is all ' + CONFIG.goal + ', ' + CONFIG.customer.first; },
    text: function () {
      return 'You earned every easyWin this cycle. Your month of ' + CONFIG.reward.name + ' is ready to claim.';
    }
  },

  grace: {
    label: 'Grace window open',
    app: function () { return CONFIG.program; },
    icon: 'hold',
    primary: true,
    title: function () {
      return 'We are holding your ' + state.wins + ' ' + plural(state.wins, 'easyWin', 'easyWins') + ', ' + CONFIG.customer.first;
    },
    text: function () {
      const by = state.graceEnds ? fmtShort(state.graceEnds) : fmtShort(addDays(state.dueDate, CONFIG.graceDays));
      return 'Nothing is lost yet. Pay any time before ' + by + ' and your streak picks up exactly where it was.';
    }
  },

  saved: {
    label: 'Streak saved',
    app: function () { return CONFIG.program; },
    icon: 'reward',
    title: function () { return 'Your streak is safe, ' + CONFIG.customer.first; },
    text: function () {
      const left = Math.max(0, CONFIG.goal - state.wins);
      return 'That payment kept all ' + state.wins + ' of your easyWins. ' +
             (left === 0 ? 'Your reward is ready to claim.'
                         : left + ' more and ' + CONFIG.reward.name + ' is yours.');
    }
  }
};

/** The variant that fits the state the demo is currently in. */
function contextualNotification() {
  if (state.trackerState === 'grace') return 'grace';
  if (state.justSaved) return 'saved';
  if (state.milestoneUnlocked) return 'milestone';
  if (dayDiff(state.dueDate, state.today) <= 2) return 'due';
  return 'payday';
}

/* ------------------------------------------------------------
   State
   ------------------------------------------------------------ */

let state;

function freshState() {
  const today = new Date(CONFIG.startDate[0], CONFIG.startDate[1], CONFIG.startDate[2]);

  return {
    // simulated clock
    today: today,
    dueDate: addDays(today, CONFIG.dueInDays),
    paidThisCycle: false,

    // easyWins
    wins: 0,
    trackerState: 'active',        // active | grace | lapsed
    graceEnds: null,
    justSaved: false,              // drives the warm "streak saved" treatment
    milestoneUnlocked: false,
    claimed: [],                   // rewards the customer has taken

    // pre-authorised debit
    autopay: false,

    // navigation
    screen: 'lock',                // lock | dashboard | history
    overlay: null,                 // amount | form | success | tracker | unlock | wins | autopay | autopayDone
    sent: [],                      // notification variant keys, in order sent

    // payment entry
    amount: '',
    lastPayment: null,
    history: CONFIG.seedHistory.map(function (h) { return Object.assign({}, h); }),

    // guards against a double-tap on Pay Now while the spinner is up
    busy: false,

    // presenter preferences (survive a reset)
    sound: true,
    autofill: true,
    fast: false
  };
}

/* ------------------------------------------------------------
   Simulation
   ------------------------------------------------------------ */

function winsLeft() { return Math.max(0, CONFIG.goal - state.wins); }

function graceDaysLeft() {
  if (state.trackerState !== 'grace' || !state.graceEnds) return 0;
  return Math.max(0, dayDiff(state.graceEnds, state.today));
}

/**
 * Advance the simulated clock by one day and let the consequences fall out.
 * Order matters: roll the cycle first, then settle autopay, then check for a
 * missed due date, then check for an expired grace window.
 */
function advanceDay() {
  state.today = addDays(state.today, 1);
  state.justSaved = false;

  // 1. A paid cycle rolls over the day after its due date.
  if (state.paidThisCycle && dayDiff(state.today, state.dueDate) > 0) {
    state.dueDate = addDays(state.dueDate, CONFIG.cycleDays);
    state.paidThisCycle = false;
  }

  // 2. Automatic payments settle on the due date, with no action from anyone.
  if (state.autopay && !state.paidThisCycle && dayDiff(state.today, state.dueDate) >= 0) {
    payAutomatically();
  }

  // 3. Due date passed unpaid — the streak pauses, it does not break.
  if (!state.paidThisCycle && state.trackerState === 'active' &&
      dayDiff(state.today, state.dueDate) > 0) {
    state.trackerState = 'grace';
    state.graceEnds = addDays(state.dueDate, CONFIG.graceDays);
  }

  // 4. Grace window expired — reset, but the next milestone stays in reach.
  if (state.trackerState === 'grace' && dayDiff(state.today, state.graceEnds) > 0) {
    state.trackerState = 'lapsed';
    state.wins = 0;
    state.graceEnds = null;
  }

  render();
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
}

/** Earn one easyWin, and flag the milestone if this was the fifth. */
function earnWin() {
  if (state.wins < CONFIG.goal) state.wins += 1;
  if (state.wins >= CONFIG.goal) state.milestoneUnlocked = true;
}

function completeManualPayment(amount, type) {
  const wasInGrace = state.trackerState === 'grace';

  recordPayment(amount, type);

  // Paying inside the window resumes the streak where it was — nothing lost.
  if (wasInGrace) {
    state.trackerState = 'active';
    state.graceEnds = null;
    state.justSaved = true;
  } else if (state.trackerState === 'lapsed') {
    state.trackerState = 'active';
  }

  earnWin();
}

function payAutomatically() {
  recordPayment(CONFIG.loan.payment, 'Automatic Payment');
  if (state.trackerState !== 'active') {
    state.trackerState = 'active';
    state.graceEnds = null;
  }
  earnWin();
}

function enrolAutopay() {
  state.autopay = true;
  earnWin();                       // enrolling is itself an easyWin
  state.overlay = 'autopayDone';
  render();
  celebrate();
}

function claimReward() {
  state.claimed.unshift({
    name: CONFIG.reward.name,
    term: CONFIG.reward.term,
    on: fmtStamp(state.today)
  });
  state.milestoneUnlocked = false;
  state.wins = 0;                  // a new run toward the next milestone
  state.overlay = 'wins';
  render();
}

/* ------------------------------------------------------------
   Presenter presets — every state the pitch needs, reachable instantly
   ------------------------------------------------------------ */

const PRESETS = {

  fresh: function () {
    state = carryPreferences(freshState());
  },

  mid: function () {
    state = carryPreferences(freshState());
    state.wins = 3;
    state.screen = 'dashboard';
  },

  nearly: function () {
    state = carryPreferences(freshState());
    state.wins = CONFIG.goal - 1;
    state.screen = 'dashboard';
  },

  grace: function () {
    state = carryPreferences(freshState());
    state.wins = 3;
    state.trackerState = 'grace';
    state.today = addDays(state.dueDate, 2);          // two days past due
    state.graceEnds = addDays(state.dueDate, CONFIG.graceDays);
    state.screen = 'dashboard';
  },

  saved: function () {
    state = carryPreferences(freshState());
    state.wins = 4;
    state.today = addDays(state.dueDate, 2);
    state.paidThisCycle = true;
    state.justSaved = true;
    state.screen = 'dashboard';
    state.overlay = 'tracker';
  },

  lapsed: function () {
    state = carryPreferences(freshState());
    state.wins = 0;
    state.trackerState = 'lapsed';
    state.today = addDays(state.dueDate, CONFIG.graceDays + 1);
    state.screen = 'dashboard';
    state.overlay = 'tracker';
  },

  autopay: function () {
    state = carryPreferences(freshState());
    state.autopay = true;
    state.wins = 1;
    state.screen = 'dashboard';
  },

  milestone: function () {
    state = carryPreferences(freshState());
    state.wins = CONFIG.goal;
    state.milestoneUnlocked = true;
    state.screen = 'dashboard';
    state.overlay = 'unlock';
  }
};

/** Presenter preferences should survive jumping between states. */
function carryPreferences(next) {
  if (state) {
    next.sound = state.sound;
    next.autofill = state.autofill;
    next.fast = state.fast;
  }
  return next;
}

function applyPreset(name) {
  if (!PRESETS[name]) return;
  PRESETS[name]();
  render();
  if (state.overlay === 'unlock' || state.justSaved) celebrate();
}

/* ------------------------------------------------------------
   Notification sound — synthesised, so there is no file to load
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
  const marks = { brand: CONFIG.brand.charAt(0), reward: ICONS.win, hold: ICONS.pause };

  return '' +
  '<div class="notif' + (n.primary ? ' primary' : '') + ' tappable' + (isNewest ? ' arriving' : '') + '"' +
       ' data-act="open-payment">' +
    '<div class="notif-icon ' + n.icon + '">' + (marks[n.icon] || '') + '</div>' +
    '<div class="notif-body">' +
      '<div class="notif-top">' +
        '<span class="notif-app">' + esc(n.app()) + '</span>' +
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
   Views — the easyWins tracker, shared by the card and the full screen
   ------------------------------------------------------------ */

/** The five step markers. Tone changes with tracker state; never red. */
function pipsHTML(size) {
  let out = '';
  for (let i = 1; i <= CONFIG.goal; i++) {
    const done = i <= state.wins;
    const isGoal = i === CONFIG.goal;
    const just = state.justSaved && i === state.wins;

    let cls = 'pip ' + size;
    if (done) cls += ' done';
    if (state.trackerState === 'grace' && done) cls += ' held';
    if (isGoal) cls += ' goal';
    if (just) cls += ' just';

    out += '<div class="' + cls + '">' +
             (isGoal && !done ? ICONS.win : (done ? ICONS.tick : i)) +
           '</div>';
  }
  return out;
}

function trackerHeadline() {
  if (state.trackerState === 'grace') {
    const d = graceDaysLeft();
    return {
      kicker: 'Streak on hold',
      title: 'Your ' + state.wins + ' ' + plural(state.wins, 'easyWin is', 'easyWins are') + ' safe',
      sub: 'Pay any time in the next ' + d + ' ' + plural(d, 'day', 'days') +
           ' and you carry straight on from ' + state.wins + ' of ' + CONFIG.goal + '.'
    };
  }
  if (state.trackerState === 'lapsed') {
    return {
      kicker: 'Fresh start',
      title: 'Your next easyWin is one payment away',
      sub: 'Every cycle starts clean. Make this month’s payment and you are straight back to 1 of ' +
           CONFIG.goal + '.'
    };
  }
  if (state.justSaved) {
    return {
      kicker: 'Streak saved',
      title: 'Nice one, ' + CONFIG.customer.first,
      sub: 'That payment kept all ' + state.wins + ' of your easyWins. ' +
           (winsLeft() === 0 ? 'Your reward is ready.' : winsLeft() + ' to go.')
    };
  }
  if (state.milestoneUnlocked) {
    return {
      kicker: CONFIG.program,
      title: 'All ' + CONFIG.goal + ' earned',
      sub: 'Your month of ' + CONFIG.reward.name + ' is ready to claim.'
    };
  }
  return {
    kicker: CONFIG.program,
    title: winsLeft() + ' more to your next reward',
    sub: 'Reach ' + CONFIG.goal + ' easyWins and ' + CONFIG.reward.name + ' is yours for a month.'
  };
}

function trackerCardHTML() {
  const grace = state.trackerState === 'grace';
  const head = trackerHeadline();

  return '' +
  '<div class="track-card ' + state.trackerState + (state.justSaved ? ' saved' : '') + '" data-act="tracker">' +
    '<div class="track-card-top">' +
      '<span class="track-card-title">' +
        (grace ? '<span class="hold-mark">' + ICONS.pause + '</span> ' : '') +
        CONFIG.program +
      '</span>' +
      '<span class="track-card-pill">' + state.wins + ' of ' + CONFIG.goal + '</span>' +
    '</div>' +
    '<div class="track-card-sub">' + esc(head.sub) + '</div>' +
    '<div class="pips">' + pipsHTML('sm') + '</div>' +
    (state.autopay
      ? '<div class="track-card-auto">' + ICONS.auto + ' Automatic payments on — your next easyWin lands on ' +
        fmtShort(state.dueDate) + '</div>'
      : '') +
  '</div>';
}

/* ------------------------------------------------------------
   Views — dashboard
   ------------------------------------------------------------ */

function loanCardHTML(loan) {
  return '' +
  '<div class="loan-card">' +
    '<div class="loan-name">' + esc(loan.name) + '</div>' +
    '<div class="loan-amount">' + esc(loan.principal) + '</div>' +
    '<div class="loan-bar"><i style="width:' + loan.progress + '%"></i></div>' +
    '<div class="loan-foot">' +
      '<div><div class="loan-k">' + esc(loan.balance) + '</div><div class="loan-v">Loan balance</div></div>' +
      '<div><div class="loan-k">$' + money(loan.payment) + '</div>' +
           '<div class="loan-v">Due ' + fmtShort(state.dueDate) + '</div></div>' +
    '</div>' +
  '</div>';
}

function graceBannerHTML() {
  const d = graceDaysLeft();
  return '' +
  '<div class="grace-banner">' +
    '<span class="grace-mark">' + ICONS.pause + '</span>' +
    '<div>' +
      '<div class="grace-title">Your streak is on hold, not lost</div>' +
      '<div class="grace-text">Pay by ' + fmtShort(state.graceEnds) + ' — that is ' + d + ' ' +
        plural(d, 'day', 'days') + ' — and your ' + state.wins + ' easyWins carry on.</div>' +
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
    '<span class="claimed-icon">' + ICONS.shield + '</span>' +
    '<div>' +
      '<div class="claimed-title">Your ' + CONFIG.program + '</div>' +
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

        (state.trackerState === 'grace' ? graceBannerHTML() : '') +

        '<button class="pay-cta" data-act="open-payment">' +
          '<span class="pay-cta-icon">$</span>' +
          '<span class="pay-cta-text">' +
            '<span class="pay-cta-title">Make a Payment</span>' +
            '<span class="pay-cta-sub">' +
              (state.trackerState === 'grace' ? 'Keep your streak' : 'Add an extra payment today') +
            '</span>' +
          '</span>' +
          '<span class="chev">›</span>' +
        '</button>' +

        trackerCardHTML() +
        autopayOfferHTML() +
        claimedStripHTML() +

        loanCardHTML(CONFIG.loan) +
        loanCardHTML(CONFIG.loan2) +

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
    '<div class="keypad">' +
      '<div class="keypad-grid">' + keypad + '</div>' +
    '</div>' +
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
   Views — processing
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

/* ------------------------------------------------------------
   Views — success
   ------------------------------------------------------------ */

function viewSuccess() {
  const p = state.lastPayment;
  const nextLabel = state.milestoneUnlocked ? 'See your reward'
                  : state.justSaved         ? 'See your streak'
                  : 'See your ' + CONFIG.program;

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

      '<div class="win-banner">' +
        '<span class="win-banner-mark">' + ICONS.win + '</span>' +
        '<span>That is easyWin <b>' + state.wins + ' of ' + CONFIG.goal + '</b></span>' +
      '</div>' +

      '<button class="btn-primary" data-act="after-payment">' + nextLabel + '</button>' +
      '<button class="btn-ghost" data-act="history">Go to payment history</button>' +
    '</div>' +
  '</div>';
}

/* ------------------------------------------------------------
   Views — tracker screen
   ------------------------------------------------------------ */

function viewTracker() {
  const head = trackerHeadline();
  const grace = state.trackerState === 'grace';
  const lapsed = state.trackerState === 'lapsed';
  const pct = Math.round((state.wins / CONFIG.goal) * 100);

  // Primary action, plus a secondary only when it says something different.
  let cta, secondary = '<button class="btn-ghost" data-act="dashboard">Back to dashboard</button>';

  if (state.milestoneUnlocked) {
    cta = '<button class="btn-primary" data-act="unlock">Claim your reward</button>';
  } else if (grace) {
    cta = '<button class="btn-primary" data-act="open-payment">Pay now and keep my streak</button>';
  } else if (lapsed) {
    cta = '<button class="btn-primary" data-act="open-payment">Make a payment</button>';
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

      '<div class="tracker-hero ' + state.trackerState + (state.justSaved ? ' saved' : '') + '">' +
        '<div class="tracker-kicker">' + esc(head.kicker) + '</div>' +
        '<div class="tracker-h1">' + esc(head.title) + '</div>' +
        '<div class="tracker-sub">' + esc(head.sub) + '</div>' +
      '</div>' +

      '<div class="tracker-body">' +

        '<div class="track-wrap">' +
          '<div class="track-top">' +
            '<span class="track-label">' + CONFIG.program +
              (grace ? ' <span class="hold-chip">' + ICONS.pause + ' on hold</span>' : '') +
            '</span>' +
            '<span class="track-count">' + state.wins + ' of ' + CONFIG.goal + '</span>' +
          '</div>' +
          '<div class="track">' + pipsHTML('lg') + '</div>' +
          '<div class="track-bar"><i data-fill="' + pct + '"></i></div>' +
        '</div>' +

        '<div class="reward-card' + (state.milestoneUnlocked ? ' unlocked' : '') + '">' +
          '<div class="reward-emoji">' + ICONS.shield + '</div>' +
          '<div>' +
            '<div class="reward-title">' + esc(CONFIG.reward.name) + '</div>' +
            '<div class="reward-text">' + esc(CONFIG.reward.tagline) + ' · ' + esc(CONFIG.reward.term) + '</div>' +
          '</div>' +
        '</div>' +

        (grace
          ? '<div class="nudge warm"><b>Nothing has been lost.</b> Your ' + state.wins +
            ' easyWins are held until ' + fmtShort(state.graceEnds) +
            '. One payment picks the streak up exactly where it was.</div>'
          : lapsed
            ? '<div class="nudge"><b>Clean slate.</b> The next milestone is only ' + CONFIG.goal +
              ' payments away, and automatic payments count too.</div>'
            : '<div class="nudge"><b>Tip:</b> Turn on automatic payments and every due date earns an easyWin without you lifting a finger.</div>') +

        '<div class="tracker-actions">' + cta + secondary + '</div>' +

      '</div>' +
    '</div>' +
  '</div>';
}

/* ------------------------------------------------------------
   Views — reward unlock and the claimed list
   ------------------------------------------------------------ */

function viewUnlock() {
  return '' +
  '<div class="scrim"></div>' +
  '<div class="sheet tall unlock-sheet">' +
    '<div class="sheet-body">' +

      '<div class="unlock-badge">' + ICONS.shield + '</div>' +
      '<div class="unlock-kicker">' + CONFIG.goal + ' of ' + CONFIG.goal + ' easyWins</div>' +
      '<div class="unlock-h1">Reward unlocked</div>' +
      '<div class="unlock-sub">Nice work, ' + esc(CONFIG.customer.first) + '. This one is on us.</div>' +

      '<div class="unlock-prize">' +
        '<div class="unlock-prize-name">' + esc(CONFIG.reward.name) + '</div>' +
        '<div class="unlock-prize-term">' + esc(CONFIG.reward.term) + '</div>' +
        '<div class="unlock-prize-text">' + esc(CONFIG.reward.blurb) + '</div>' +
      '</div>' +

      '<button class="btn-primary" data-act="claim">Claim my month free</button>' +
      '<button class="btn-ghost" data-act="tracker">Not right now</button>' +
    '</div>' +
  '</div>';
}

function viewWins() {
  const rows = state.claimed.length
    ? state.claimed.map(function (c) {
        return '<div class="win-row">' +
                 '<span class="win-row-icon">' + ICONS.shield + '</span>' +
                 '<div class="win-row-body">' +
                   '<div class="win-row-name">' + esc(c.name) + '</div>' +
                   '<div class="win-row-meta">' + esc(c.term) + ' · claimed ' + esc(c.on) + '</div>' +
                 '</div>' +
                 '<span class="win-row-state">Active</span>' +
               '</div>';
      }).join('')
    : '<div class="win-empty">Nothing claimed yet. Reach ' + CONFIG.goal +
      ' easyWins and your first reward lands here.</div>';

  return '' +
  '<div class="scrim"></div>' +
  '<div class="sheet tall" style="background:var(--app-bg)">' +
    '<div class="sheet-body">' +
      '<div class="wins-h1">Your ' + CONFIG.program + '</div>' +
      '<div class="wins-sub">Rewards you have earned and claimed.</div>' +
      '<div class="win-list">' + rows + '</div>' +
      '<div class="wins-next">' +
        'Next milestone: <b>' + winsLeft() + ' more ' + plural(winsLeft(), 'easyWin', 'easyWins') + '</b>' +
      '</div>' +
      '<button class="btn-primary" data-act="dashboard">Back to dashboard</button>' +
    '</div>' +
  '</div>';
}

/* ------------------------------------------------------------
   Views — automatic payments (two screens, one tap)
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
        'We take ' + CONFIG.currency + ' ' + money(CONFIG.loan.payment) +
        ' on each due date from your ' + esc(CONFIG.testCard.type) + ' ending 0007.' +
      '</div>' +

      '<div class="auto-points">' +
        '<div class="auto-point"><span>' + ICONS.tick + '</span>Every due date earns an easyWin automatically</div>' +
        '<div class="auto-point"><span>' + ICONS.tick + '</span>Your streak keeps building with no action needed</div>' +
        '<div class="auto-point"><span>' + ICONS.tick + '</span>Change or cancel any time in Account</div>' +
      '</div>' +

      '<div class="auto-bonus">' +
        '<span class="auto-bonus-mark">' + ICONS.win + '</span>' +
        '<span>Switch on now and earn <b>one easyWin straight away</b></span>' +
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

      '<div class="win-banner">' +
        '<span class="win-banner-mark">' + ICONS.win + '</span>' +
        '<span>easyWin earned — that is <b>' + state.wins + ' of ' + CONFIG.goal + '</b></span>' +
      '</div>' +

      '<div class="nudge"><b>From here on it runs itself.</b> Every due date adds an easyWin, ' +
        'so your streak keeps building even in a busy month.</div>' +

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
  $('#sbTime').textContent = clockTime();

  paintChrome();
  if (state.overlay === 'amount') renderAmountBox();

  const fill = $('.track-bar i');
  if (fill) requestAnimationFrame(function () { fill.style.width = fill.dataset.fill + '%'; });

  updateCaption();
  syncPresenter();
}

/**
 * The status bar and home indicator float over the screen, so each needs to be
 * light or dark depending on what sits behind it. They can differ.
 */
function paintChrome() {
  const paleSheet = ['form', 'success', 'wins', 'autopay', 'autopayDone', 'processing'].indexOf(state.overlay) !== -1;
  const darkTopSheet = ['tracker', 'unlock'].indexOf(state.overlay) !== -1;

  let statusDark = paleSheet;
  let indicatorDark = paleSheet || darkTopSheet || state.screen === 'history';

  $('#statusbar').classList.toggle('dark', statusDark);
  $('#homeIndicator').classList.toggle('dark', indicatorDark);
}

function updateCaption() {
  const map = {
    amount:      'Enter an amount',
    form:        'Card details pre-filled — tap Pay Now',
    processing:  'Processing…',
    success:     'Payment complete — an easyWin earned',
    tracker:     'easyWins tracker',
    unlock:      'Milestone reached — reward unlocked',
    wins:        'Rewards claimed so far',
    autopay:     'Automatic payments — an earnable action',
    autopayDone: 'Enrolled — easyWin earned'
  };

  const base = state.screen === 'lock'
    ? (state.sent.length ? 'Tap a notification' : 'Send a notification to begin')
    : state.screen === 'history' ? 'Payment history' : 'Dashboard';

  $('#phoneCaption').textContent = map[state.overlay] || base;
}

/* ------------------------------------------------------------
   Short celebration. Deliberately under a second — executives see this
   several times in one sitting.
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

  $('#phoneScreen').appendChild(layer);
  setTimeout(function () { layer.remove(); }, 1000);
}

/* ------------------------------------------------------------
   Navigation
   ------------------------------------------------------------ */

function goDashboard() {
  state.screen = 'dashboard';
  state.overlay = null;
  render();
}

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

function goTracker()  { state.screen = 'dashboard'; state.overlay = 'tracker'; render(); }
function goUnlock()   { state.screen = 'dashboard'; state.overlay = 'unlock'; render(); celebrate(); }
function goWins()     { state.screen = 'dashboard'; state.overlay = 'wins'; render(); }
function goAutopay()  { state.screen = 'dashboard'; state.overlay = 'autopay'; render(); }
function goHistory()  { state.screen = 'history'; state.overlay = null; render(); }

/** Tapping a notification opens the app straight into the payment sheet. */
function openFromNotification() {
  if (state.screen === 'lock') {
    state.screen = 'dashboard';
    state.overlay = null;
    render();
    // One frame later so the dashboard is painted behind the sheet.
    requestAnimationFrame(goAmount);
  } else {
    goAmount();
  }
}

function payNow() {
  if (state.busy) return;              // ignore a double tap
  if (!validateForm()) return;

  const amount = amountValue();

  function settle() {
    state.busy = false;
    completeManualPayment(amount, 'Manual Payment');
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
  if (state.milestoneUnlocked) goUnlock();
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
  'autofill':      function () { state.autofill = true; $('#optAutofill').checked = true; render(); },
  'cvv-help':      function () { const h = $('#cvvHelp'); if (h) h.hidden = !h.hidden; }
};

document.addEventListener('click', function (e) {
  const keyEl = e.target.closest('[data-key]');
  if (keyEl) { pressKey(keyEl.dataset.key); return; }

  const quickEl = e.target.closest('[data-quick]');
  if (quickEl) { state.amount = quickEl.dataset.quick; renderAmountBox(); return; }

  const actEl = e.target.closest('[data-act]');
  if (actEl && ACTIONS[actEl.dataset.act]) { ACTIONS[actEl.dataset.act](); return; }

  const presetEl = e.target.closest('[data-preset]');
  if (presetEl) { applyPreset(presetEl.dataset.preset); return; }

  const notifEl = e.target.closest('[data-notif]');
  if (notifEl) { sendNotification(notifEl.dataset.notif); return; }
});

/* ------------------------------------------------------------
   Notification sender
   ------------------------------------------------------------ */

function sendNotification(key) {
  // Notifications land on the lock screen, so go there if we drifted.
  state.screen = 'lock';
  state.overlay = null;

  const variant = key || contextualNotification();
  state.sent.push(variant);
  playChime();
  render();
}

function clearNotifications() {
  state.sent = [];
  render();
}

/* ------------------------------------------------------------
   Presenter panel
   ------------------------------------------------------------ */

/** Write text only if the element exists — see the note on on(). */
function setText(selector, text) {
  const el = $(selector);
  if (el) el.textContent = text;
}

function syncPresenter() {
  setText('#simDate', fmtLong(state.today) + ', ' + state.today.getFullYear());
  setText('#simDue', fmtShort(state.dueDate));
  setText('#simWins', state.wins + ' / ' + CONFIG.goal);

  setText('#simState',
      state.trackerState === 'grace'  ? 'Grace · ' + graceDaysLeft() + 'd left'
    : state.trackerState === 'lapsed' ? 'Reset after lapse'
    : state.justSaved                 ? 'Streak saved'
    : state.milestoneUnlocked         ? 'Milestone reached'
    : 'Active');

  setText('#simAuto', state.autopay ? 'On' : 'Off');
  setText('#sendNotifCount', state.sent.length + ' on screen');
}

function togglePresenter(force) {
  const p = $('#presenter');
  p.classList.toggle('open', force === undefined ? !p.classList.contains('open') : force);
}

function resetEverything() {
  state = carryPreferences(freshState());
  render();
}

/**
 * Bind a listener only if the element is there. A missing control must never
 * throw and take the whole prototype down with it — a blank phone mid-pitch is
 * the worst possible failure.
 */
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

  on('#optAutofill', 'change', function (e) {
    state.autofill = e.target.checked;
    if (state.overlay === 'form') render();
  });

  on('#optSound', 'change', function (e) { state.sound = e.target.checked; });
  on('#optFast',  'change', function (e) { state.fast = e.target.checked; });
}

/* Number keys map to the states the presenter uses most. */
const KEY_PRESETS = {
  '1': 'fresh',
  '2': 'mid',
  '3': 'nearly',
  '4': 'grace',
  '5': 'saved',
  '6': 'lapsed',
  '7': 'autopay',
  '8': 'milestone'
};

document.addEventListener('keydown', function (e) {
  if (e.target.matches('input, select, textarea')) return;

  if (KEY_PRESETS[e.key]) { applyPreset(KEY_PRESETS[e.key]); return; }

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

   Not a responsive layout: the frame keeps its exact proportions and is
   scaled uniformly, so an unexpected projector resolution cannot clip it.
   ------------------------------------------------------------ */

const WRAP_H = 852 + 18 + 20;
const WRAP_W = 393;

function fitPhone() {
  const scale = Math.min(1, (window.innerHeight - 32) / WRAP_H, (window.innerWidth - 40) / WRAP_W);
  $('#phoneWrap').style.transform = 'translate(-50%, -50%) scale(' + Math.max(0.3, scale) + ')';
}

window.addEventListener('resize', fitPhone);

/* ------------------------------------------------------------
   Boot
   ------------------------------------------------------------ */

/**
 * Order matters: get the phone drawn and scaled first, then wire the controls.
 * If wiring ever fails, the prototype is still visible and still scaled rather
 * than a blank, oversized frame.
 */
function boot() {
  state = freshState();
  render();
  fitPhone();
  wireControls();
}

try {
  boot();
} catch (err) {
  // Never fail silently to a blank screen — say what went wrong.
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
