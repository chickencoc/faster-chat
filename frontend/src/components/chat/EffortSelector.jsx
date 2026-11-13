import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ChevronDown } from "lucide-preact";
import { VARIANTS, selectorButtonClass, selectorPanelClass } from "./ModelSelector";

const labels = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high" };

export default function EffortSelector({ imageMode, value, options, onChange, disabled }) {
  const label = imageMode ? "Image complexity" : "Reasoning effort";
  const variant = VARIANTS[imageMode ? "image" : "text"];

  return (
    <Menu as="div" className="relative min-w-0">
      <MenuButton
        aria-label={`${label}: ${labels[value] ?? "Default"}`}
        title={label}
        disabled={disabled}
        className={`${variant.buttonClass} ${selectorButtonClass} disabled:opacity-50`}>
        <span className="truncate">{labels[value] ?? "Default"}</span>
        <ChevronDown className="ui-open:rotate-180 h-4 w-4 shrink-0 transition-transform duration-200" />
      </MenuButton>
      <MenuItems className={`${selectorPanelClass} w-max min-w-28 p-1`}>
        {options.map((level) => (
          <MenuItem
            key={level}
            as="button"
            onClick={() => onChange(level)}
            className={`text-theme-text data-[focus]:bg-theme-surface-strong block w-full rounded-lg px-3 py-2 text-left text-sm ${value === level ? variant.activeItemClass : ""}`}>
            {labels[level]}
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}
