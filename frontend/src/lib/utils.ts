import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function formatDateInput(date: string) {
  return date.slice(0, 10);
}

export function toIsoDate(date: string) {
  return new Date(`${date}T12:00:00`).toISOString();
}
