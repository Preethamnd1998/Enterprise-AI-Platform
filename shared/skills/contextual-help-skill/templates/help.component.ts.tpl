import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { AccordionModule } from "primeng/accordion";
import { ButtonModule } from "primeng/button";
import { DialogModule } from "primeng/dialog";
import { TooltipModule } from "primeng/tooltip";
import { __PREFIX_UPPER___HELP_CONTENT, __Pascal__HelpTab } from "./__PREFIX__-help-content";

/** Contextual Help button + dialog for __SCREEN__. */
@Component({
  selector: "__SELECTOR__",
  standalone: true,
  imports: [CommonModule, ButtonModule, DialogModule, TooltipModule, AccordionModule],
  templateUrl: "./__PREFIX__-help.component.html",
  styleUrls: ["./__PREFIX__-help.component.scss"],
})
export class __Pascal__HelpComponent {
  @Input() activeTab: __Pascal__HelpTab = "__DEFAULT_KEY__";
  /** "About this tab" for tabbed screens; pass "About this screen" for single-view screens. */
  @Input() aboutHeading = "About this tab";

  visible = false;
  content = __PREFIX_UPPER___HELP_CONTENT;

  open(): void {
    this.visible = true;
  }
}
