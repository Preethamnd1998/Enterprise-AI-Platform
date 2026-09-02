# Modern Clinical Enterprise UI --- Design System & AI Agent Rules

## 1. Purpose

This document defines the **global visual design language and
implementation rules** for the application.

The application already contains a **built-in layout/theme customization
system** with controls for items such as:

-   Light / Dark mode
-   Layout/theme scale
-   Menu mode
-   Menu profile position
-   Input style
-   Ripple effect
-   Menu themes
-   Topbar themes
-   Component themes
-   Table header themes

These customization controls already exist in the application and are
the **source of truth for runtime customization**.

### Important

**Do not create, redesign, duplicate, or replace the existing
customization/settings panel.**

AI agents must build UI that **works with the existing customization
system**.

The purpose of this document is to define how new and redesigned screens
should consume the application's existing theme and layout
configuration.

------------------------------------------------------------------------

# 2. Design Identity

## Modern Clinical Enterprise

The application's visual language is:

> **A clean, modern, professional, compact, information-dense healthcare
> enterprise SaaS UI with neutral surfaces, semantic colors, subtle
> borders, moderate radii, strong typography hierarchy, and globally
> configurable themes.**

The UI should feel like a mature clinical/enterprise application rather
than a marketing website.

------------------------------------------------------------------------

# 3. Core Design Principles

Follow these principles across every screen:

1.  **Color communicates.**
2.  **Typography organizes.**
3.  **Spacing separates.**
4.  **Borders define.**
5.  **Icons clarify.**
6.  **Hierarchy guides attention.**
7.  **Consistency reduces cognitive load.**
8.  **Accessibility is mandatory.**
9.  **Global customization controls appearance.**
10. **Components must consume the existing theme system.**
11. **Light and dark mode must work automatically.**
12. **Business functionality must never be changed for visual
    redesign.**

The design system defines **how screens should look**.

The existing application customization system defines **which
theme/layout variant is currently active**.

------------------------------------------------------------------------

# 4. Relationship With the Existing Customization System

The existing customization UI should be treated as a **Theme/Layout
Provider**.

Conceptually:

``` text
Existing Application Customizer
            │
            ├── Color Scheme
            ├── Theme Scale
            ├── Menu Mode
            ├── Menu Position
            ├── Input Style
            ├── Ripple
            ├── Menu Theme
            ├── Topbar Theme
            ├── Component Theme
            └── Table Header Theme
                     │
                     ▼
              Global Theme System
                     │
                     ▼
              Application Screens
```

New screens must consume this system.

### AI agents must NOT

-   Create another theme selector.
-   Create another dark-mode toggle.
-   Create another color picker.
-   Create screen-specific theme settings.
-   Create a duplicate menu-theme configuration.
-   Create a separate table-theme configuration.
-   Hard-code a light-only design.
-   Hard-code a dark-only design.
-   Override the user's selected global theme unnecessarily.

### AI agents SHOULD

-   Reuse existing theme tokens.
-   Reuse existing CSS variables.
-   Reuse existing component theme configuration.
-   Reuse existing layout configuration.
-   Automatically respond to theme changes.
-   Make new components compatible with all existing customization
    options.

------------------------------------------------------------------------

# 5. Existing Customization Options

The screenshots supplied with this design specification represent the
**existing application customization UI**.

The design system does not define new controls for these settings.

Instead, these options should be considered supported application-level
capabilities.

## Existing configuration

``` text
Layout / Theme Scale
Color Scheme
Menu Mode
Menu Profile Position
Input Style
Ripple Effect
Menu Themes
Topbar Themes
Component Themes
Table Header Themes
```

The exact available values and color palettes are controlled by the
application's existing implementation.

**Do not hard-code the screenshot palette into individual screens.**

The screenshots demonstrate the available customization capability, not
a requirement that every screen use one fixed color.

------------------------------------------------------------------------

# 6. Theme Consumption

Every screen must be theme-aware.

A component should conceptually consume:

``` text
Primary color
Surface color
Surface background
Text color
Secondary text
Border color
Focus color
Success color
Warning color
Danger color
Info color
Selected state
Hover state
Disabled state
```

Use semantic theme variables/tokens.

### Preferred

``` css
background: var(--surface-card);
color: var(--text-color);
border-color: var(--surface-border);
```

### Avoid

``` css
background: #ffffff;
color: #172033;
border-color: #e2e8f0;
```

when those values represent application-level theme properties.

------------------------------------------------------------------------

# 7. Light Mode

Light mode should provide a clean clinical enterprise appearance.

Typical characteristics:

``` text
Page              → very light neutral
Cards             → white
Borders           → subtle gray
Primary text      → dark neutral
Secondary text    → muted gray
Interactive       → configured primary color
Semantic states   → controlled semantic colors
```

A typical baseline may resemble:

``` text
Page background:   #F8FAFC
Card background:   #FFFFFF
Primary text:      #172033
Secondary text:    #64748B
Muted text:        #94A3B8
Border:            #E2E8F0
```

These are **baseline examples**, not values that agents should hard-code
if the existing theme system already provides equivalent tokens.

------------------------------------------------------------------------

# 8. Dark Mode

Dark mode must be a first-class supported theme.

Do not create a separate visual design for dark mode.

Instead, the same components and design language must adapt through the
global theme system.

Typical dark characteristics:

``` text
Page              → deep neutral/slate
Cards             → slightly lighter neutral
Borders           → visible but subtle
Primary text      → high-contrast light
Secondary text    → muted light gray
Primary color     → configured theme color with sufficient contrast
```

Typical baseline:

``` text
Page background:   #0F172A
Card background:   #111827
Section:           #1E293B
Primary text:      #F8FAFC
Secondary text:    #CBD5E1
Border:            #334155
```

Again, these are reference values only.

If the existing application theme provides these values, **use the
existing variables instead of duplicating them**.

------------------------------------------------------------------------

# 9. Theme Switching Requirements

When the existing application switches between Light and Dark mode,
every new screen must update correctly.

This includes:

``` text
Page background
Cards
Panels
Sidebar
Topbar
Tables
Dialogs
Dropdowns
Inputs
Buttons
Tabs
Badges
Tooltips
Menus
Empty states
Loading states
Notifications
Charts
```

There must be no:

-   White card that remains white in an inappropriate dark surface
-   Dark text that becomes unreadable in dark mode
-   Hard-coded border colors
-   Hard-coded shadow colors
-   Hard-coded input backgrounds
-   Hard-coded hover colors

------------------------------------------------------------------------

# 10. Color Philosophy

The application uses **color as information**.

Neutral colors should dominate the UI.

The configured theme/primary color should be used for:

-   Primary actions
-   Active navigation
-   Selected controls
-   Links
-   Focus states
-   Active tabs
-   Important interactive states

Semantic colors should communicate:

``` text
Success
Warning
Error
Information
Status
Category
Priority
```

Do not make every component colorful.

### Principle

> **Color should explain something, not merely decorate something.**

------------------------------------------------------------------------

# 11. Healthcare Enterprise Visual Language

The UI should resemble a professional clinical workspace.

Characteristics:

-   Clean
-   Calm
-   Reliable
-   Compact
-   Structured
-   Highly readable
-   Information-dense
-   Low visual noise
-   Predictable
-   Accessible

The interface should prioritize the user's workflow over visual
decoration.

------------------------------------------------------------------------

# 12. Layout Style

Prefer structured enterprise application layouts.

A typical workspace can follow:

``` text
┌─────────────────────────────────────────────────────────┐
│                     TOPBAR                              │
├───────────────┬─────────────────────────────────────────┤
│               │                                         │
│   CONTEXT /   │             WORKSPACE                   │
│   NAVIGATION  │                                         │
│               │                                         │
│               │                                         │
├───────────────┴─────────────────────────────────────────┤
│                 ACTION AREA                             │
└─────────────────────────────────────────────────────────┘
```

Depending on the existing Menu Mode setting, the same application
content should work with:

``` text
Static
Overlay
Slim
Slim +
Reveal
Drawer
Horizontal
```

**Do not implement screen-specific behavior that breaks these existing
layout modes.**

------------------------------------------------------------------------

# 13. Cards

Use cards for logical information grouping.

Recommended characteristics:

``` text
Background: theme surface/card token
Border: 1px subtle theme border
Radius: 10–14px
Shadow: none or very subtle
Padding: 16–20px
```

Cards should organize information, not simply decorate the screen.

------------------------------------------------------------------------

# 14. Typography

Use the application's existing global font if one is already configured.

If no application font exists, **Inter** is the recommended default.

Suggested hierarchy:

``` text
Page title:       18–22px / 600–700
Section title:    14–16px / 600
Body:             13–14px / 400–500
Metadata:         11–12px / 400–500
Labels:           11–13px / 500–600
Table content:    12–14px
```

Avoid oversized typography.

The visual hierarchy should come primarily from:

``` text
Size
Weight
Spacing
Contrast
Position
```

rather than decoration.

------------------------------------------------------------------------

# 15. Spacing

Use a consistent spacing system based around:

``` text
4px
8px
12px
16px
20px
24px
32px
40px
48px
```

Prefer existing application spacing tokens if available.

Most UI spacing should be around:

``` text
8px
12px
16px
24px
```

Do not introduce arbitrary spacing values without a reason.

------------------------------------------------------------------------

# 16. Border Radius

Use moderate rounding.

``` text
Small controls:      6–8px
Inputs:              8–10px
Buttons:             8–10px
Cards:               10–14px
Dialogs/panels:      12–16px
Status badges:       999px
```

Avoid making the entire application look like a collection of pills.

------------------------------------------------------------------------

# 17. Borders

Use subtle borders to define structure.

Typical semantic usage:

``` css
border: 1px solid var(--surface-border);
```

Borders are preferred over heavy shadows for:

-   Cards
-   Panels
-   Sections
-   Tables
-   Inputs
-   Navigation boundaries
-   Dividers

------------------------------------------------------------------------

# 18. Shadows

Use restrained elevation.

Preferred:

``` text
No shadow
or
Very subtle shadow
```

Stronger elevation may be used for:

-   Dialogs
-   Dropdowns
-   Popovers
-   Floating panels
-   Temporary overlays

Avoid large dashboard-style shadows.

------------------------------------------------------------------------

# 19. Buttons

Buttons should be compact and professional.

### Primary

``` text
Configured primary color
High-contrast text
Moderate radius
Medium font weight
Compact height
```

### Secondary

``` text
Surface background
Subtle border
Neutral/primary text
```

### Outlined

``` text
Surface/transparent background
Configured primary border
Configured primary text
```

### Text

``` text
No heavy container
Configured text color
Subtle hover state
```

Button colors must respond to the existing component theme.

------------------------------------------------------------------------

# 20. Inputs

The application already supports the global:

``` text
Outlined
Filled
```

input styles.

New screens must **consume the currently selected input style**.

Do not mix styles randomly.

For example:

``` text
If global setting = Outlined
→ new screen uses outlined inputs.

If global setting = Filled
→ new screen uses filled inputs.
```

Input states:

``` text
Default
Hover
Focus
Filled/value
Disabled
Read-only
Error
Success
Warning
```

------------------------------------------------------------------------

# 21. Tables

Tables should support high-volume enterprise healthcare data.

Use:

-   Compact row heights
-   Clear headers
-   Subtle row separators
-   Hover feedback
-   Sorting
-   Filtering
-   Pagination
-   Status badges
-   Consistent alignment
-   Sticky headers where appropriate

The existing **Table Header Theme** controls the table header
appearance.

Do not create another table-header color system.

New tables must automatically respect the existing table-header
customization.

The table body should remain mostly neutral unless row coloring
communicates meaningful status.

------------------------------------------------------------------------

# 22. Status Indicators

Use small semantic indicators.

Example:

``` text
● Active
● Pending
● Completed
● Cancelled
● Failed
```

Preferred:

``` text
Small icon/dot
Soft semantic background
Semantic text
Compact padding
```

Do not use large saturated blocks unless strong emphasis is genuinely
required.

------------------------------------------------------------------------

# 23. Icons

Use the application's existing icon library.

If a library is not already established, use one consistent outline icon
family such as:

``` text
PrimeIcons
Lucide
Material Symbols
Phosphor
```

Typical sizing:

``` text
Normal:       16–18px
Navigation:   16–20px
Large action: 20–24px
```

Do not mix unrelated icon styles.

------------------------------------------------------------------------

# 24. Interaction States

Every interactive component should account for:

``` text
Default
Hover
Focus
Active
Selected
Disabled
Loading
Success
Error
```

The states must consume the global theme.

Do not create arbitrary per-screen interaction colors.

------------------------------------------------------------------------

# 25. Ripple Effect

The application already provides a global Ripple Effect setting.

New components should respect that setting.

### When enabled

Interactive controls may provide the application's existing ripple
feedback.

### When disabled

Do not introduce a custom ripple implementation.

Also respect reduced-motion accessibility preferences.

------------------------------------------------------------------------

# 26. Menu and Topbar

The application already supports configurable:

``` text
Menu Mode
Menu Position
Menu Theme
Topbar Theme
```

New screens must work correctly with all supported configurations.

Do not:

-   Assume the menu is always on the left.
-   Assume the menu is always visible.
-   Assume the topbar has a fixed color.
-   Hard-code dimensions that break Overlay/Drawer/Slim modes.
-   Place content where a configurable menu can overlap it.

Prefer responsive and logical layout properties.

For RTL support, prefer:

``` css
margin-inline-start
margin-inline-end
padding-inline-start
padding-inline-end
inset-inline-start
inset-inline-end
```

instead of hard-coded left/right assumptions.

------------------------------------------------------------------------

# 27. Existing Theme Palette

The screenshots show that the application already provides multiple
theme palettes for:

``` text
Menu
Topbar
Components
Table Header
```

These are **existing runtime options**.

AI agents should not reproduce the palette definitions unless the
existing implementation does not expose them.

Instead:

``` text
Existing theme selection
        ↓
Existing theme variables/configuration
        ↓
New UI consumes those values
```

The new UI must remain visually correct regardless of which supported
palette the user selects.

------------------------------------------------------------------------

# 28. Theme Tokens

The application should expose semantic tokens equivalent to:

``` text
--primary-color
--primary-color-text

--surface-ground
--surface-card
--surface-section
--surface-overlay
--surface-border

--text-color
--text-color-secondary
--text-color-muted

--success-color
--warning-color
--danger-color
--info-color

--focus-ring
--border-radius
```

The exact variable names depend on the existing application
implementation.

### Important

**Do not create duplicate variables if equivalent global tokens already
exist.**

Before adding a token, AI agents must inspect the existing theme
implementation.

------------------------------------------------------------------------

# 29. CSS Architecture

Theme-aware components should use semantic variables.

Preferred:

``` css
.card {
  background: var(--surface-card);
  color: var(--text-color);
  border: 1px solid var(--surface-border);
}
```

Not:

``` css
.card {
  background: #fff;
  color: #172033;
  border: 1px solid #e2e8f0;
}
```

For primary interactions:

``` css
.button-primary {
  background: var(--primary-color);
  color: var(--primary-color-text);
}
```

The exact variables must match the application's existing theme
implementation.

------------------------------------------------------------------------

# 30. Dark/Light Compatibility Checklist

Before completing a UI task, the AI agent must verify:

### Light

-   [ ] Page is readable
-   [ ] Cards are distinguishable
-   [ ] Borders are visible
-   [ ] Text has sufficient contrast
-   [ ] Inputs are readable
-   [ ] Buttons are readable
-   [ ] Tables are readable
-   [ ] Dialogs/popovers are readable

### Dark

-   [ ] Page does not use inappropriate white surfaces
-   [ ] Text remains readable
-   [ ] Borders remain visible
-   [ ] Inputs remain readable
-   [ ] Table headers remain readable
-   [ ] Status colors remain distinguishable
-   [ ] Disabled states remain understandable
-   [ ] Focus indicators remain visible
-   [ ] Dialogs/dropdowns use appropriate dark surfaces

### Custom themes

-   [ ] Primary/component theme works
-   [ ] Menu theme works
-   [ ] Topbar theme works
-   [ ] Table-header theme works
-   [ ] Input style works
-   [ ] Menu mode works
-   [ ] Menu position works
-   [ ] Scale setting works
-   [ ] Ripple setting is respected

------------------------------------------------------------------------

# 31. Accessibility

Accessibility must survive every customization option.

Requirements:

-   Adequate text contrast
-   Keyboard navigation
-   Visible focus indicators
-   Screen-reader labels
-   Logical tab order
-   Do not rely only on color
-   Accessible disabled states
-   Accessible error states
-   Reduced-motion support
-   Responsive text scaling
-   Usable controls in both Light and Dark mode

A custom theme must not make important information inaccessible.

------------------------------------------------------------------------

# 32. Responsive Design

The application should retain the same design identity across:

``` text
Desktop
Tablet
Mobile
```

Responsive behavior may change layout, but not the design language.

Example:

``` text
Desktop
Sidebar + workspace

Tablet
Collapsible menu + workspace

Mobile
Drawer + full-width workspace
```

The existing Menu Mode configuration must continue to work with
responsive layouts.

------------------------------------------------------------------------

# 33. AI Agent Workflow Before UI Changes

Before implementing or redesigning a screen, an AI agent must:

### Step 1 --- Inspect existing theme implementation

Find:

``` text
Theme service
CSS variables
Global SCSS/CSS
Theme files
Dark-mode implementation
Layout configuration
Menu configuration
Component theme configuration
Table theme configuration
```

### Step 2 --- Reuse existing tokens

Do not invent a parallel theme system.

### Step 3 --- Inspect existing reusable components

Prefer:

``` text
Existing buttons
Existing inputs
Existing cards
Existing tables
Existing dialogs
Existing badges
Existing layout components
Existing pagination
Existing form components
```

### Step 4 --- Implement the screen

Follow the Modern Clinical Enterprise visual language.

### Step 5 --- Verify customization

Test the screen with:

``` text
Light
Dark
Different component theme
Different menu theme
Different topbar theme
Different table header theme
Outlined input
Filled input
Different menu modes
Different menu positions
Different scale
Ripple ON/OFF
```

### Step 6 --- Verify accessibility

Check:

``` text
Contrast
Focus
Keyboard
Disabled state
Error state
Responsive behavior
```

------------------------------------------------------------------------

# 34. AI Agent Hard Rules

## MUST

-   Preserve existing functionality.
-   Preserve business logic.
-   Preserve validations.
-   Preserve API behavior.
-   Preserve permissions.
-   Use the existing global theme system.
-   Use existing reusable components where appropriate.
-   Support Light and Dark modes.
-   Support existing customization settings.
-   Use semantic tokens.
-   Maintain accessibility.
-   Maintain consistent enterprise visual language.

## MUST NOT

-   Create another customization/settings panel.
-   Create another dark-mode mechanism.
-   Create another theme service unless explicitly requested.
-   Create duplicate color palettes.
-   Hard-code theme colors unnecessarily.
-   Create screen-specific global styles.
-   Break existing menu modes.
-   Break topbar customization.
-   Break table-header customization.
-   Break input style customization.
-   Add unnecessary gradients.
-   Add glassmorphism.
-   Add neon colors.
-   Add excessive shadows.
-   Add excessive animations.
-   Change business behavior while redesigning the UI.

------------------------------------------------------------------------

# 35. Design Quality Standard

A completed screen should look as though it was built by the **same
product team** as the existing application.

It should not look like:

``` text
Screen A → modern
Screen B → colorful
Screen C → glassmorphism
Screen D → material design
Screen E → random AI-generated UI
```

It should look like:

``` text
                 GLOBAL THEME
                      │
                      ▼
        ┌─────────────────────────┐
        │ Modern Clinical         │
        │ Enterprise Design       │
        └─────────────────────────┘
          │       │       │
          ▼       ▼       ▼
        Screen  Screen  Screen
          │       │       │
          └───────┼───────┘
                  ▼
        Same visual language
        + existing customization
        + Light/Dark support
```

------------------------------------------------------------------------

# 36. Final Design Principle

> **The existing customization system controls the application's
> appearance. The design system controls how UI is constructed within
> that appearance.**

Therefore:

> **Do not build new customization controls. Build theme-aware UI that
> automatically responds to the customization controls already present
> in the application.**

The target experience is:

> **Modern Clinical Enterprise --- clean, compact, professional,
> accessible, information-dense healthcare SaaS UI with global theme
> awareness and full compatibility with the application's existing
> customization system.**
