import type { HelpArticle } from "../types";

export const FIELD: HelpArticle[] = [
  {
    slug: "job-schedule",
    title: "A job's schedule",
    group: "Field",
    area: "field",
    pages: ["/projects/*/schedule"],
    what: "A job's **Schedule** tab lays out the work as tasks, grouped by phase, on a Gantt chart: what happens when, who's on it, and what waits on what. Move one task and everything waiting on it moves too. Your client sees the schedule in their portal, and subs see the tasks assigned to them.",
    how: [
      "Open the job's **Schedule** tab.",
      "Start fast: under **Schedule templates**, pick a template and a start date and click **Build the schedule**. Or click **+ Add task** to build it by hand.",
      "Click a task to change its dates, % complete, who's on it, or what it waits on.",
      "As work happens, use **Mark started** and **Mark complete**. They go in the day's daily log by themselves.",
      "When rain, an inspection or a late delivery holds you up, use **Delay this job**: everything not finished moves out, and it's logged.",
    ],
    sections: [
      {
        heading: "The top",
        items: [
          { name: "Tasks / Overall complete / Schedule ends / Overdue tasks", what: "How many tasks and how many are done, how far along the job is (weighted by task length), the last end date with workdays lost to delays, and what's overdue." },
          { name: "+ Add task", what: "Adds a task at the end of its phase." },
          { name: "Delete schedule", what: "Deletes every task, link and reminder on the job's schedule. The delay log stays." },
          { name: "Calendar", what: "The company calendar." },
          { name: "Gantt / List", what: "Bars on a timeline, or a table with start, end, workdays, assignee, progress and what each waits on. Phones show a list of cards." },
        ],
      },
      {
        heading: "Working with tasks",
        items: [
          { name: "Click a task", what: "Opens it to edit." },
          { name: "Grip (drag)", what: "Moves a task up or down, or into another phase. Only the order changes, not the dates." },
          { name: "Insert above / below", what: "Hover a task for these, or use the blue + in the margin. Below starts after it ends and waits on it." },
          { name: "Trash (Erase this task)", what: "Removes a task. Tasks waiting on it stop waiting; their dates stay." },
        ],
      },
      {
        heading: "A task",
        items: [
          { name: "Task name / Phase / Custom phase", what: "What it is and which phase it's in (Pre-Construction, Site Work, Foundation, Framing…), or your own phase." },
          { name: "Start / End / % complete", what: "Its dates and progress. Lengths count your workdays only." },
          { name: "Assignee", what: "Who on your team owns it." },
          { name: "Sub / vendor", what: "The sub doing it. They see it in their portal." },
          { name: "Waits on", what: "Tasks that must finish first, plus a lag in workdays. It starts after the last of them finishes, and moves when they do.", how: "Click **+ Waits on…**, pick the task, set the lag." },
          { name: "Color / Milestone / Notes", what: "The bar's color; a milestone is a one-day marker (◆); notes for you." },
          { name: "+1 workday / +1 week", what: "Pushes the task later; everything waiting on it moves too." },
          { name: "Mark started / Mark complete", what: "Sets it under way or done, and adds \"Started:\" or \"Completed:\" to today's daily log." },
          { name: "Reminders", what: "A to-do for someone so many workdays before or after the task starts, such as \"Confirm lumber delivery\". It moves when the task moves." },
        ],
      },
      {
        heading: "Delays and templates",
        items: [
          {
            name: "Delay this job",
            what: "Moves everything not finished out by so many workdays; finished tasks stay. Pick the reason, the day, how many workdays, and a note. **Show the reason to the client** puts the reason in their daily log; they always see the new dates. Shows for admins and positions that **Can delay a job's schedule**.",
          },
          { name: "Delays", what: "The log of every delay: day, reason, workdays, tasks moved, by whom, and what the client sees." },
          { name: "Start from a template", what: "Builds the schedule (or adds tasks) from a schedule template, starting on a date, on your workdays, skipping holidays." },
          { name: "Save this schedule as a template", what: "Saves this job's tasks, lengths and links as a template for the next job." },
        ],
      },
    ],
    tips: ["Your workdays and delay reasons are in **Settings → Work week & delays**; holidays go on the company calendar."],
    related: ["company-schedule", "daily-logs", "schedule-settings", "todos"],
  },
  {
    slug: "company-schedule",
    title: "Schedule: Look-ahead and Calendar",
    group: "Field",
    area: "field",
    pages: ["/schedule", "/schedule/calendar"],
    what: "**Schedule** in the menu shows the work on every active job. **Look-ahead** is the next four weeks; **Calendar** is a month or week view with holidays, time off and reminders, where you add them.",
    how: [
      "Click **Schedule** in the menu.",
      "**Look-ahead**: see this week's tasks and each job's next four weeks. Click a task to open it on its job.",
      "**Calendar**: click a day's number to see everything on it and add a holiday, time off or a reminder.",
    ],
    sections: [
      {
        heading: "Look-ahead",
        items: [
          { name: "This week", what: "Every task under way this week, with job, dates, assignee and progress. Red dates are overdue." },
          { name: "Each job", what: "A small Gantt of its next four weeks. **Full schedule →** opens the job's Schedule tab." },
        ],
      },
      {
        heading: "Calendar",
        items: [
          { name: "‹ › / Today / Month / Week", what: "Move through time, jump back to today, and switch between month and week." },
          { name: "Job / Person / Filter", what: "Show one job's or one person's items." },
          { name: "Assigned while off", what: "Warns when someone has a task during their time off." },
          { name: "Day number", what: "Opens the day: everything on it, and boxes to add to it." },
          { name: "Reminder", what: "A note for someone on that day, such as \"Call the brick supplier\". It shows in their To-Dos that day." },
          { name: "Time off", what: "Vacation, sick or personal days for a person. Admins add anyone's; others add their own." },
          { name: "Holiday", what: "Admins: a day nobody works. Schedules skip it. With the box ticked, work already on it moves out on active jobs (logged as a delay)." },
          { name: "Time off — this year", what: "Each person's vacation used and left, sick and personal days. Set vacation days in Settings → Team." },
        ],
      },
    ],
    related: ["job-schedule", "todos"],
  },
  {
    slug: "schedule-settings",
    title: "Settings: work week, delay reasons and schedule templates",
    group: "Settings",
    area: "lists",
    pages: ["/settings/schedule", "/catalog/schedule-templates"],
    what: "**Work week & delays** (admins) sets the days your crews work and your list of delay reasons. **Schedule templates** are schedules to start new jobs from.",
    how: ["Go to **Settings** and open the page.", "Make your changes and save."],
    sections: [
      {
        heading: "Work week & delays",
        items: [
          { name: "Work week", what: "Tick the days your crews work. Task lengths count these days; schedules skip the rest and the holidays. Dates already on schedules stay." },
          { name: "Delay reasons", what: "What you pick from when you delay a job. Click a common one (Rain / weather, Inspection, Material late, Sub no-show, Client change…) or add your own." },
        ],
      },
      {
        heading: "Schedule templates",
        items: [
          { name: "New schedule template", what: "Starts an empty template." },
          { name: "Add the sample: New home, slab on grade", what: "About 50 tasks from plans to the client walkthrough, about 6 months. Edit it to fit how you build." },
          { name: "The editor", what: "Each task: name, milestone, phase, workdays, what it waits on (with lag), and a default person. Drag to reorder; the blue + inserts. Click **Save template**; nothing saves until you do." },
        ],
        text: ["Or save a real job's schedule as a template from its Schedule tab."],
      },
    ],
    related: ["job-schedule"],
  },
  {
    slug: "daily-logs",
    title: "Daily logs",
    group: "Field",
    area: "field",
    pages: ["/projects/*/daily-logs", "/projects/*/daily-logs/new", "/projects/*/daily-logs/*/edit"],
    what: "Daily logs are the job's diary: each day's weather, crew, hours, work done, issues and photos. Your client sees them in their portal unless you mark a log internal.",
    how: [
      "Open the job's **Daily Logs** tab and click **+ New log**.",
      "Crew and hours are already filled in from today's time clock. Leave the weather blank and it's filled in for the job's ZIP code when you save.",
      "Type what got done, any issues, and add photos: on a phone, **Take photo** opens the camera. Tap a photo to mark it up before you save.",
      "Click **Save log**.",
    ],
    sections: [
      {
        heading: "A log",
        items: [
          { name: "Date", what: "The day it's for." },
          { name: "Weather / High °F / Low °F", what: "Left blank, they're filled in from the U.S. weather service for the job's area (for days in the last week or so). Anything you type is kept." },
          { name: "Weather notes", what: "What the weather did to the work, such as \"Rained out after lunch\". Never filled in for you." },
          { name: "Crew on site / Hours worked", what: "Filled from today's time clock on this job; change them if needed." },
          { name: "Work completed / Issues / delays / Internal notes", what: "What got done, what held things up (safety, inspections), and notes only your team sees." },
          { name: "Take photo", what: "On a phone or tablet: opens the camera. Take as many as you need, one after another." },
          { name: "Add photos", what: "Pictures from your phone's library or your computer. They're also filed in the job's Photos folder." },
          { name: "Mark up", what: "Tap a photo to draw on it before it's saved: **Draw**, **Arrow**, **Circle**, **Text** (a typed note), **Crop** and **Turn**, in red, yellow, blue, white or black. **Undo** takes back the last step; **Save** keeps the marked-up photo (it replaces the original); **Cancel** leaves it as it was. The × takes a photo off before you save." },
          { name: "Visible to client", what: "Ticked, the client sees the log in their portal. Unticked, it's marked **Internal**." },
          { name: "Delete log", what: "On Edit: deletes the log and its photos." },
        ],
      },
    ],
    tips: ["Marking a schedule task started or complete, or delaying the job, adds a line to that day's log by itself."],
    related: ["job-schedule", "files", "time-clock"],
  },
  {
    slug: "todos",
    title: "To-dos",
    group: "Field",
    area: null,
    pages: ["/todos", "/projects/*/todos"],
    what: "To-dos are things someone needs to do: call a sub, order windows, follow up on a lead. **To-Dos** in the menu (or the bell) shows yours across every job; a job's **To-Dos** tab shows that job's.",
    how: ["Click **+ Add to-do**.", "Type what needs to happen, set a due date, priority and who, and click **Add to-do**.", "Click the round button to mark it done."],
    sections: [
      {
        heading: "The list",
        items: [
          { name: "Open / Done / All", what: "Which to-dos to show." },
          { name: "Mine / Everyone", what: "Yours, or everybody's (if your position sees the schedule)." },
          { name: "Round button", what: "Marks it done (or open again)." },
          { name: "Pencil / Delete", what: "Change or remove a to-do." },
          { name: "Due", what: "Red with \"overdue\" when it's past due." },
        ],
      },
      {
        heading: "Adding one",
        items: [
          { name: "Title / Description / Due date", what: "What needs to happen and by when." },
          { name: "Priority", what: "Low, Normal or High." },
          { name: "Assignee / Project", what: "Who does it, and which job it's for (on a job's tab it's that job)." },
        ],
      },
    ],
    tips: [
      "Lead follow-ups, calendar reminders and schedule task reminders show up here as to-dos.",
      "You can always change to-dos assigned to you or made by you. Changing other people's needs **Can edit** on the schedule area.",
    ],
    related: ["company-schedule", "leads", "warranty"],
  },
  {
    slug: "warranty",
    title: "Warranty requests",
    group: "Field",
    area: "field",
    pages: ["/warranty", "/projects/*/warranty", "/projects/*/warranty/*"],
    what: "After move-in, your client reports anything that needs fixing from their portal's **Warranty** tab, with photos. You send a sub or someone on your team, set the day, and close it out when it's fixed. **Warranty** in the menu lists every job's requests; a finished job's **Warranty** tab lists that job's.",
    how: [
      "When a job is finished, set its **Actual end date** (job → **Edit**). The warranty runs from that day, for the months in **Settings → Company**. The job gets a **Warranty** tab and the client's portal gets one too.",
      "Your client reports something from their portal. The job's manager (or, with no manager, the admins) gets an email right away. A phone call? Add it yourself: **Add a warranty request** on the job's Warranty tab.",
      "Open the request. Under **Who's fixing it**, pick a sub, someone on your team, or both, and the day, then click **Save**. The sub gets an email and sees it on their portal's **Warranty** page. The client gets an email with the day.",
      "When it's fixed, under **Close it out** pick **Done** (or **Not covered**), say what was done, add after photos, and click **Close request**. A sub can also mark it done from their portal.",
    ],
    sections: [
      {
        heading: "A request",
        items: [
          { name: "New / Scheduled / Done / Not covered", what: "Where it stands. It's **Scheduled** once it has a day. The client and the sub see the same words." },
          { name: "Urgent", what: "Water, no heat or power, something unsafe. Urgent ones go to the top of every list." },
          { name: "Change what it says", what: "Fix the title, where in the house, or the details. **Delete request** is for one added by mistake (its photos stay in the job's Files, folder Warranty)." },
          { name: "Who's fixing it", what: "A sub (from Settings → Vendors), someone on your team, and the day. **Email the client the day** tells them when someone's coming." },
          { name: "Close it out", what: "**Done** or **Not covered**, with what was done or why not. The client reads it, so write it for them. **Reopen** puts it back on the list." },
          { name: "Notes", what: "Back and forth about the request, with photos. The client sees them unless you tick **Team only**. Notes from a sub are always team only, so you decide what the client hears." },
        ],
      },
      {
        heading: "What the client and the sub see",
        items: [
          { name: "The client's Warranty tab", what: "Shows up once their home is finished. They report something (what, where, details, photos, urgent), see its status and the day someone's coming, read your notes and add their own." },
          { name: "The sub's Warranty page", what: "Each request they're sent to: the address with directions, the homeowner's name and phone, the photos and notes. They set the day they'll be there, send you a note, or mark it done with after photos. You and the client are emailed each time." },
          { name: "A sub with no portal sign-in", what: "They get the email with everything in it and reply to you with the day." },
        ],
      },
      {
        heading: "The Warranty page (menu)",
        items: [
          { name: "Open / Closed / All", what: "Which requests to show, across every job." },
          { name: "Who's fixing it", what: "The sub and team member on each, and its day." },
        ],
      },
    ],
    tips: [
      "Warranty is part of **Schedule, daily logs & to-dos** in Settings → Team. A position that can edit it can assign and close requests.",
      "A request reported after the warranty has ended still comes in. Close it as **Not covered** with the reason, or fix it anyway as a courtesy.",
      "Phones: the client, the sub and the team can turn on notifications for warranty requests on their **Account** page.",
    ],
    related: ["todos", "clients", "vendors", "company-settings"],
  },
  {
    slug: "files",
    title: "Files",
    group: "Jobs",
    area: "files",
    pages: ["/projects/*/files"],
    what: "A job's **Files** tab keeps its documents and photos in folders (Photos, Plans, Documents, Contracts, Permits, Bids) and lets you choose which ones the client sees in their portal.",
    how: [
      "Open the job's **Files** tab and click **Upload files**.",
      "Pick the folder, choose the files (several at once, up to 25 MB each), and decide **Visible to client**.",
      "Photos show small before you upload: tap one to mark it up (draw, arrows, circles, notes, crop, turn). On a phone, **Take photo** opens the camera.",
      "Click **Upload**. Online, each file shows its own progress bar while it uploads; any that don't make it are named, and the rest are saved.",
    ],
    sections: [
      {
        heading: "On the tab",
        items: [
          { name: "Folder chips", what: "Shows all files, or one folder." },
          { name: "Client / Internal", what: "Whether the client sees a file.", how: "Click to switch." },
          { name: "Open", what: "Opens the file in a new tab. PDFs and pictures open in the browser; the rest download." },
          { name: "Log (date)", what: "On a photo from a daily log: opens that log." },
          { name: "Delete", what: "Removes the file for good." },
        ],
      },
    ],
    tips: [
      "Photos are made web-sized as they're added (2,560 pixels on the long side), so they upload fast on a job-site signal; small pictures are left exactly as they are.",
      "iPhone photos (HEIC) are turned into JPGs when added from the iPhone. One copied to a PC and uploaded from there stays HEIC and downloads instead of opening: set the iPhone to Settings › Camera › Formats › Most Compatible to take JPGs.",
    ],
    related: ["takeoff-plans", "daily-logs", "messages"],
  },
  {
    slug: "messages",
    title: "Messages",
    group: "Jobs",
    area: "files",
    pages: ["/projects/*/messages"],
    what: "A job's **Messages** tab holds conversations about the job. A conversation is either shown to the client (in their portal, and they're emailed) or **Internal**, for your team only.",
    how: [
      "Open the job's **Messages** tab and click **New conversation**.",
      "Type a subject and the first message. Leave **Visible to client** ticked to include the client, or untick it for a team-only thread.",
      "Click **Start conversation**. Reply at the bottom of the thread.",
    ],
    sections: [
      {
        heading: "On the tab",
        items: [
          { name: "Conversations", what: "Every thread, newest activity first. **Internal** marks team-only threads." },
          { name: "Send reply", what: "Adds your reply. In a client thread, the client gets an email with a link to read and reply in their portal." },
          { name: "Delete thread", what: "Admins: deletes the thread and all its messages." },
        ],
      },
    ],
    tips: ["Whether a thread is client or internal is set when you start it and can't be changed after."],
    related: ["files", "clients"],
  },
];
