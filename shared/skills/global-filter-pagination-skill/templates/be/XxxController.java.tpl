package __BASE_PACKAGE__.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import __BASE_PACKAGE__.common.util.SqlSafe;
import __BASE_PACKAGE__.dto.__Feature__PagedDTO;
import __BASE_PACKAGE__.service.__Feature__Service;

/**
 * Paged + filtered list. Contract: shared/skills/global-filter-pagination-skill/reference/end-to-end-contract.md
 * - pageNo is 0-based (raw PrimeNG index), pageSize defaults 15 (UI default) and is clamped to 1..100.
 * - UI sends "" for empty filters; blank -> null here, so the SQL builder only sees null or a validated value.
 * - Raw Strings are validated/parsed HERE (SqlSafe), never inside the SQL class.
 */
@RestController
public class __Feature__Controller {

	private static final int MAX_PAGE_SIZE = 100;

	private final __Feature__Service service;

	public __Feature__Controller(__Feature__Service service) {
		this.service = service;
	}

	@GetMapping("__ROUTE__")
	public ResponseEntity<__Feature__PagedDTO> getList(@RequestParam() Long siteId,
			@RequestParam(defaultValue = "0") Integer pageNo, @RequestParam(defaultValue = "15") Integer pageSize,
			@RequestParam(defaultValue = "", required = false) String startDate,
			@RequestParam(defaultValue = "", required = false) String endDate,
			@RequestParam(defaultValue = "", required = false) String search,
			@RequestParam(defaultValue = "", required = false) String statusCodes,
			@RequestParam(required = false) Long ownerId,
			@RequestParam(defaultValue = "false", required = false) Boolean activeOnly) {

		int safePage = Math.max(pageNo == null ? 0 : pageNo, 0);
		int safeSize = Math.min(Math.max(pageSize == null ? 15 : pageSize, 1), MAX_PAGE_SIZE);

		__Feature__PagedDTO body = service.getList(siteId, safePage, safeSize, SqlSafe.dateTime(startDate),
				SqlSafe.dateTime(endDate), SqlSafe.likeContains(search), SqlSafe.codeList(statusCodes), ownerId,
				activeOnly);
		return new ResponseEntity<>(body, HttpStatus.OK);
	}
}
