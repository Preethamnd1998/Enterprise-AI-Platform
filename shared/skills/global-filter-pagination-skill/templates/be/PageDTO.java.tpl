package __BASE_PACKAGE__.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Pagination metadata. Field names/order mirror the UI model (src/app/data/model/page-dto.ts).
 * currentPageSize = rows on THIS page (Page.getNumberOfElements()), not the requested pageSize.
 * Reuse the service's existing PageDTO if one already exists (ipd-service: opd.appointment.dto / billing.dto).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PageDTO {

	private int totalPages;
	private int currentPageNo;
	private int currentPageSize;
	private Long total;

}
