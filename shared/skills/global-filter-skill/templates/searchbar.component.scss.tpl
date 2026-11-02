// Global filter panel — extracted from searchbar-all-appointment.component.scss (only the rules the panel uses).
// The reference file also contains unrelated chat/KPI rules (.kpi-value, .circle, …): not copied.

::ng-deep .p-splitter {
  border: none;
}

.time-container {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.list-item {
  margin-bottom: 1rem;
  cursor: pointer;
  transition: color 0.3s;
  font-weight: 400;
  color: #796e81;
}

.list-item:hover {
  color: #22c55e;
}

.selected {
  font-weight: 600;
  color: #188a42;
  padding: 4px;
  border-radius: 10px;
  background-color: #caf1d8;
  margin-right: 5px;
}

.tick-mark {
  margin-left: 5px;
}

.p-dropdown {
  width: 100%;
  border: 1px solid rgba(0, 0, 0, 0.212);
  background-color: #f6faff;
}

// Vertical From/To block
.date-range-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px 0;
}

.date-field-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .date-label,
  label {
    font-weight: 500;
    font-size: 14px;
    color: #333;
    margin-bottom: 4px;
  }

  p-calendar {
    width: 100%;

    ::ng-deep .p-calendar {
      width: 100%;
    }

    ::ng-deep .p-inputtext {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
  }
}

// Button theme (scoped to this component; inline [style] backgrounds on Clear/Search/Save Filter override the base colour)
.p-button.p-button-danger,
.p-buttonset.p-button-danger > .p-button,
.p-splitbutton.p-button-danger > .p-button {
  color: #ffffff;
  background: #f95656;
  border: 0 none;
  border-radius: 20px;
  padding-bottom: 7px;
}

.p-button {
  color: #ffffff;
  background: #009688;
  border: 0 none;
  padding: 5px;
  font-size: 1rem;
  padding-bottom: 7px;
  transition:
    background-color 0.2s,
    border-color 0.2s,
    color 0.2s,
    box-shadow 0.2s,
    background-size 0.2s cubic-bezier(0.64, 0.09, 0.08, 1);
  border-radius: 20px;
}
