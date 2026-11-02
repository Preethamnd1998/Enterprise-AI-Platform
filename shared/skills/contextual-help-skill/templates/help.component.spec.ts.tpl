import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { __Pascal__HelpComponent } from "./__PREFIX__-help.component";
import { __PREFIX_UPPER___HELP_CONTENT } from "./__PREFIX__-help-content";

describe("__Pascal__HelpComponent", () => {
  let fixture: ComponentFixture<__Pascal__HelpComponent>;
  let component: __Pascal__HelpComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [__Pascal__HelpComponent, NoopAnimationsModule] }).compileComponents();
    fixture = TestBed.createComponent(__Pascal__HelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("starts closed and opens on open()", () => {
    expect(component.visible).toBeFalse();
    component.open();
    expect(component.visible).toBeTrue();
  });

  it("renders the help trigger with the question-circle icon", () => {
    const btn = fixture.nativeElement.querySelector("p-button");
    expect(btn).toBeTruthy();
    expect(btn.innerHTML).toContain("pi-question-circle");
  });

  it("has complete content for every key (About + How to use never empty)", () => {
    for (const [key, section] of Object.entries(__PREFIX_UPPER___HELP_CONTENT)) {
      expect(section.title).withContext(key).toBeTruthy();
      expect(section.about).withContext(key).toBeTruthy();
      expect(section.howTo.length).withContext(key).toBeGreaterThan(0);
    }
  });

  it("renders the section matching the active key when opened", () => {
    component.open();
    fixture.detectChanges();
    const text = document.body.textContent ?? "";
    expect(text).toContain(__PREFIX_UPPER___HELP_CONTENT[component.activeTab].title);
  });
});
