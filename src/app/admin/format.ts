// shortcut: console dates are shown in Pakistan time (the only market now); use the viewer's zone when there are more.
const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" });

export const formatWhen = (iso: string) => when.format(new Date(iso));
