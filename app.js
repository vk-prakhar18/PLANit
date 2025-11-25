const defaultSubjects = [
  { subject: "Calculus", priority: 5 },
  { subject: "Physics", priority: 4 },
  { subject: "Chemistry", priority: 3 },
];

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STORAGE_KEYS = {
  form: "planit-form-state",
  plan: "planit-plan-state",
};

let currentPlan = null;

const roundToQuarter = (value) => Math.max(0.25, Math.round(value * 4) / 4);

const parseCommaList = (value = "") =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const hydrateSubjects = (subjectsData = defaultSubjects) => {
  const subjectsContainer = document.getElementById("subjectsList");
  subjectsContainer.innerHTML = "";

  const createRow = (data = { subject: "", priority: 3 }) => {
    const row = document.createElement("div");
    row.className = "subject-row";

    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Subject";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "eg. Calculus";
    nameInput.required = true;
    nameInput.value = data.subject || "";
    nameInput.dataset.field = "subject";
    nameLabel.appendChild(nameInput);

    const priorityLabel = document.createElement("label");
    priorityLabel.textContent = "Priority (1-5)";
    const select = document.createElement("select");
    select.dataset.field = "priority";
    for (let i = 1; i <= 5; i += 1) {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = i;
      if (Number(data.priority) === i) option.selected = true;
      select.appendChild(option);
    }
    priorityLabel.appendChild(select);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-row";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      if (subjectsContainer.children.length > 1) {
        row.remove();
      }
    });

    row.appendChild(nameLabel);
    row.appendChild(priorityLabel);
    row.appendChild(removeBtn);
    subjectsContainer.appendChild(row);
  };

  const seeds = subjectsData.length ? subjectsData : defaultSubjects;
  seeds.forEach((subject) => createRow(subject));

  const addBtn = document.getElementById("addSubjectBtn");
  if (!addBtn.dataset.bound) {
    addBtn.dataset.bound = "true";
    addBtn.addEventListener("click", () => createRow());
  }
};

const collectFormData = () => {
  const form = document.getElementById("plannerForm");
  const formData = new FormData(form);

  const subjects = Array.from(
    document.querySelectorAll("#subjectsList .subject-row")
  )
    .map((row) => {
      const subject = row.querySelector("[data-field='subject']").value.trim();
      const priority = Number(row.querySelector("[data-field='priority']").value);
      return subject ? { subject, priority } : null;
    })
    .filter(Boolean);

  return {
    studentName: formData.get("studentName"),
    examDate: formData.get("examDate"),
    daysAvailable: Number(formData.get("daysAvailable")),
    dailyHours: Number(formData.get("dailyHours")),
    subjects: subjects.length ? subjects : defaultSubjects,
    weakAreas: parseCommaList(formData.get("weakAreas")),
    tasks: (formData.get("tasks") || "")
      .split("\n")
      .map((task) => task.trim())
      .filter(Boolean),
    sleepHours: Number(formData.get("sleepHours")),
    screenTime: Number(formData.get("screenTime")),
    loggedStudy: Number(formData.get("loggedStudy")),
    mood: Number(formData.get("mood")),
    wakeTime: formData.get("wakeTime"),
    sleepTime: formData.get("sleepTime"),
    readingMinutes: Number(formData.get("readingMinutes")),
    waterIntake: Number(formData.get("waterIntake")),
    needsMotivation: Boolean(formData.get("needsMotivation")),
  };
};

const buildTimetable = (data) => {
  const days = dayNames.slice(0, Math.min(7, Math.max(1, Math.round(data.daysAvailable || 5))));
  const weakSet = new Set(data.weakAreas.map((area) => area.toLowerCase()));
  const subjects = data.subjects;
  const weights = subjects.map((subject) => {
    const boost = weakSet.has(subject.subject.toLowerCase()) ? 1.5 : 0;
    return Math.max(1, subject.priority) + boost;
  });

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const weekly = {};

  days.forEach((day) => {
    const daySessions = subjects.map((subject, index) => {
      const share = (weights[index] / totalWeight) * data.dailyHours;
      const hours = roundToQuarter(share);
      return {
        subject: subject.subject,
        hours,
        focusLevel: Math.min(5, Math.max(2, subject.priority)),
      };
    });
    weekly[day] = daySessions.filter((session) => session.hours >= 0.25);
  });

  const primarySubject = [...subjects].sort((a, b) => b.priority - a.priority)[0];
  const notes = `Keep ${primarySubject.subject} in the first block, then rotate into weak areas for spaced repetition.`;

  return { weekly, notes, primarySubject: primarySubject.subject };
};

const buildTasks = (data, timetable) => {
  if (!data.tasks.length) {
    return [
      {
        task: "Add at least three tasks to see prioritization.",
        priority: "Medium",
        reason: "Tasks feed the AI stack. Enter them above and re-run.",
      },
    ];
  }

  const weakSet = new Set(data.weakAreas.map((area) => area.toLowerCase()));
  const highSubject = timetable.primarySubject.toLowerCase();

  const categorize = (task, index) => {
    const normalized = task.toLowerCase();
    if (weakSet.size && Array.from(weakSet).some((area) => normalized.includes(area))) {
      return {
        priority: "High",
        reason: "Targets a declared weak concept that will yield quick gains.",
      };
    }
    if (normalized.includes(highSubject)) {
      return {
        priority: "High",
        reason: `Aligns with your highest priority subject (${timetable.primarySubject}).`,
      };
    }
    if (index < 2) {
      return {
        priority: "Medium",
        reason: "Early queue task—complete it to keep backlog short.",
      };
    }
    return {
      priority: "Low",
      reason: "Can follow after core sessions or batch later in the week.",
    };
  };

  return data.tasks.map((task, index) => {
    const { priority, reason } = categorize(task, index);
    return { task, priority, reason };
  });
};

const buildFocus = (data) => {
  const sleepScore = Math.min(1, data.sleepHours / 8);
  const screenPenalty = Math.min(1, data.screenTime / 6);
  const studyScore = Math.min(1, (data.loggedStudy || 0) / Math.max(1, data.dailyHours));
  const moodScore = (data.mood || 3) / 5;

  const focusScore = Math.round(
    sleepScore * 25 + (1 - screenPenalty) * 20 + studyScore * 30 + moodScore * 25
  );

  const analysis = `Sleep at ${data.sleepHours}h and ${data.loggedStudy} study hours build a steady base, yet ${data.screenTime}h of screen time and mood ${data.mood}/5 limit upper focus.`;
  const tips = "Anchor a 10-minute wind-down, cap screens 60 min pre-study, and insert a mood reset walk.";

  return { focusScore, analysis, tips };
};

const buildHabits = (data) => {
  const suggestions = [
    `Shift wake up to ${data.wakeTime || "07:00"} with sunlight in 10 minutes.`,
    `Set a pre-study breathing ritual before each ${Math.round(data.dailyHours || 3)}h block.`,
    `Upgrade reading to ${data.readingMinutes + 5 || 25} minutes with reflection notes.`,
    `Sip water every hour to hit ${data.waterIntake || 2}L without thinking.`,
    "Pair light mobility or stretching with hydration cues for energy.",
  ];

  const optimizedRoutine = {
    wakeUp: data.wakeTime || "07:00",
    sleep: data.sleepTime || "22:45",
    studyBlock: "08:00–10:00 deep work, 18:00–19:30 review",
    breaks: "10-minute resets every 60–75 minutes with movement",
    reading: `${data.readingMinutes || 20} minute nightly reading ritual`,
    hydrationGoal: `${data.waterIntake || 2}L via 6 cues (wake, mid-morn, lunch, mid-afternoon, pre-dinner, pre-bed)`,
  };

  return { habitSuggestions: suggestions, optimizedRoutine };
};

const buildMotivation = (data, tasks) => {
  if (!data.needsMotivation) {
    return {
      motivation: "Focused execution beats intensity—stick to the blocks you designed.",
      challenge: "Review your timetable alignment at the end of today.",
      affirmation: "I show up for myself with calm consistency.",
      quote: "",
    };
  }

  const topTask = tasks.find((task) => task.priority === "High") || tasks[0];
  return {
    motivation: `${data.studentName || "You"} already have the plan—today is about stacking precise reps.`,
    challenge: topTask ? `Complete "${topTask.task}" in a timed deep-focus block.` : "Log two quality Pomodoros and note wins.",
    affirmation: "I turn deliberate practice into confident results.",
    quote: "“Discipline is remembering what you want.” — David Campbell",
  };
};

const aboutContent = {
  title: "PlanIt AI",
  description:
    "PlanIt AI blends data-aware study strategy with calming UI, crafted by a student-first developer who loves turning messy schedules into smooth progress.",
};

const contactContent = {
  email: "hello@planit.ai",
  socials: "@planitai (IG/Twitter placeholders)",
};

const buildPlan = (data) => {
  const timetable = buildTimetable(data);
  const taskPrioritizer = { tasks: buildTasks(data, timetable) };
  const focus = buildFocus(data);
  const habits = buildHabits(data);
  const motivation = buildMotivation(data, taskPrioritizer.tasks);

  return {
    studentName: data.studentName,
    examDate: data.examDate,
    timetable,
    taskPrioritizer,
    focus,
    habits,
    motivation,
    aboutPage: aboutContent,
    contactPage: contactContent,
  };
};

const saveState = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("PlanIt save failed", error);
  }
};

const loadState = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("PlanIt load failed", error);
    return null;
  }
};

const prefillForm = (data) => {
  if (!data) return;
  const form = document.getElementById("plannerForm");
  form.studentName.value = data.studentName || "";
  form.examDate.value = data.examDate || "";
  form.daysAvailable.value = data.daysAvailable || 5;
  form.dailyHours.value = data.dailyHours || 4;
  form.weakAreas.value = (data.weakAreas || []).join(", ");
  form.tasks.value = (data.tasks || []).join("\n");
  form.sleepHours.value = data.sleepHours || "";
  form.screenTime.value = data.screenTime || "";
  form.loggedStudy.value = data.loggedStudy || "";
  form.mood.value = data.mood || "";
  form.wakeTime.value = data.wakeTime || "";
  form.sleepTime.value = data.sleepTime || "";
  form.readingMinutes.value = data.readingMinutes || "";
  form.waterIntake.value = data.waterIntake || "";
  form.needsMotivation.checked = Boolean(data.needsMotivation);
};

const renderTimetable = (plan) => {
  const grid = document.getElementById("timetableGrid");
  grid.innerHTML = "";

  Object.entries(plan.timetable.weekly).forEach(([day, sessions]) => {
    const card = document.createElement("div");
    card.className = "card timetable-card";

    const heading = document.createElement("h4");
    heading.textContent = day;
    const total = sessions.reduce((sum, session) => sum + session.hours, 0);
    const totalEl = document.createElement("span");
    totalEl.className = "chip";
    totalEl.textContent = `${total.toFixed(1)}h`;
    heading.appendChild(totalEl);

    card.appendChild(heading);

    sessions.forEach((session) => {
      const row = document.createElement("div");
      row.className = "session";

      const subject = document.createElement("strong");
      subject.textContent = session.subject;

      const meta = document.createElement("span");
      meta.textContent = `${session.hours}h · F${session.focusLevel}`;

      row.appendChild(subject);
      row.appendChild(meta);
      card.appendChild(row);
    });

    grid.appendChild(card);
  });

  document.getElementById("timetableNote").textContent = plan.timetable.notes;
};

const renderTasks = (plan) => {
  const list = document.getElementById("taskList");
  list.innerHTML = "";

  plan.taskPrioritizer.tasks.forEach((item) => {
    const card = document.createElement("div");
    card.className = "card task-card";

    const badge = document.createElement("span");
    badge.className = `badge badge-${item.priority.toLowerCase()}`;
    badge.textContent = item.priority;

    const title = document.createElement("strong");
    title.textContent = item.task;

    const reason = document.createElement("p");
    reason.textContent = item.reason;
    reason.style.color = "var(--muted)";

    card.appendChild(badge);
    card.appendChild(title);
    card.appendChild(reason);
    list.appendChild(card);
  });
};

const renderFocus = (plan) => {
  const card = document.getElementById("focusCard");
  card.classList.add("focus-card");
  card.innerHTML = `
    <span class="eyebrow">Focus Score</span>
    <p class="focus-score">${plan.focus.focusScore}</p>
    <p>${plan.focus.analysis}</p>
    <div class="chip" style="align-self:flex-start;margin-top:1rem;">${plan.focus.tips}</div>
  `;
  document.getElementById("focusScoreBadge").textContent = plan.focus.focusScore;
};

const renderMotivation = (plan) => {
  const card = document.getElementById("motivationCard");
  card.classList.add("motivation-card");
  card.innerHTML = `
    <span class="eyebrow">Motivation Builder</span>
    <strong>${plan.motivation.motivation}</strong>
    <p><strong>Challenge:</strong> ${plan.motivation.challenge}</p>
    <p><strong>Affirmation:</strong> ${plan.motivation.affirmation}</p>
    ${plan.motivation.quote ? `<p><em>${plan.motivation.quote}</em></p>` : ""}
  `;
};

const renderHabits = (plan) => {
  const list = document.getElementById("habitList");
  list.innerHTML = `
    <span class="eyebrow">Habits</span>
    <h4>5 micro-upgrades</h4>
    <ul class="habit-list">
      ${plan.habits.habitSuggestions.map((habit) => `<li>${habit}</li>`).join("")}
    </ul>
  `;

  const routine = document.getElementById("routineCard");
  routine.innerHTML = `
    <span class="eyebrow">Optimized Routine</span>
    <div class="routine-grid">
      ${Object.entries(plan.habits.optimizedRoutine)
        .map(
          ([label, value]) => `
          <div class="routine-item">
            <strong>${label.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}</strong><br/>
            <span>${value}</span>
          </div>
        `
        )
        .join("")}
    </div>
  `;
};

const renderInfoCards = (plan) => {
  document.getElementById("aboutCard").innerHTML = `
    <span class="eyebrow">About</span>
    <h4>${plan.aboutPage.title}</h4>
    <p>${plan.aboutPage.description}</p>
  `;

  document.getElementById("contactCard").innerHTML = `
    <span class="eyebrow">Contact</span>
    <p><strong>Email:</strong> ${plan.contactPage.email}</p>
    <p><strong>Socials:</strong> ${plan.contactPage.socials}</p>
  `;
};

const updateSummary = (plan) => {
  const summaryCard = document.getElementById("summaryCard");
  summaryCard.classList.remove("hidden");
  document.getElementById("focusScoreBadge").textContent = plan.focus.focusScore;
  document.getElementById("primaryFocusBadge").textContent = plan.timetable.primarySubject;

  if (plan.examDate) {
    const targetDate = new Date(plan.examDate);
    const today = new Date();
    const diffDays = Math.max(
      0,
      Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    );
    document.getElementById("countdownBadge").textContent = `${diffDays} days`;
  } else {
    document.getElementById("countdownBadge").textContent = "--";
  }
};

const revealSections = () => {
  document.querySelectorAll("[data-section], #summaryCard").forEach((section) => {
    section.classList.remove("hidden");
  });
};

const renderPlan = (plan) => {
  renderTimetable(plan);
  renderTasks(plan);
  renderFocus(plan);
  renderMotivation(plan);
  renderHabits(plan);
  renderInfoCards(plan);
  updateSummary(plan);
  revealSections();
};

const initTheme = () => {
  const toggle = document.getElementById("themeToggle");
  const stored = localStorage.getItem("planit-theme") || "light";
  if (stored === "dark") {
    document.body.classList.add("dark");
    toggle.innerHTML = "<span>🌙</span>";
  }

  toggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    toggle.innerHTML = `<span>${isDark ? "🌙" : "☀️"}</span>`;
    localStorage.setItem("planit-theme", isDark ? "dark" : "light");
  });
};

const init = () => {
  initTheme();
  const savedForm = loadState(STORAGE_KEYS.form);
  hydrateSubjects(savedForm?.subjects?.length ? savedForm.subjects : defaultSubjects);
  if (savedForm) {
    prefillForm(savedForm);
  }

  const savedPlan = loadState(STORAGE_KEYS.plan);
  if (savedPlan) {
    currentPlan = savedPlan;
    renderPlan(currentPlan);
  }

  document.getElementById("plannerForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = collectFormData();
    saveState(STORAGE_KEYS.form, formData);
    currentPlan = buildPlan(formData);
    saveState(STORAGE_KEYS.plan, currentPlan);
    renderPlan(currentPlan);
  });
};

document.addEventListener("DOMContentLoaded", init);

