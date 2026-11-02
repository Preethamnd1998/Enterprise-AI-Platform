package __BASE_PACKAGE__.query;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import org.springframework.data.domain.Pageable;

/**
 * Applied recipe of shared/standards/backend/sql-query.md.
 * ONE method returns ONE complete literal string so a breakpoint on `return` shows runnable SQL.
 * Types: Long/Integer/Boolean/enum are concatenated directly; dates arrive already PARSED (LocalDateTime);
 * code strings are whitelist-validated by the caller; free text is pre-rendered by SqlSafe.likeContains().
 * Verify table/column names against the live DB (mcp__*-db__query) before editing.
 */
public final class __Feature__SQL {

	private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

	private __Feature__SQL() {
	}

	/**
	 * @param from/to        nullable; screens without a date filter pass null and get recent-first
	 * @param nameLike       null or SqlSafe.likeContains(raw) — already quoted/escaped, includes ESCAPE clause
	 * @param statusCodes    null or whitelist-validated, e.g. "'A','B'" built via SqlSafe.codeList(...)
	 * @param isPagination   false only for export/unpaged callers
	 */
	public static String getList(Long siteId, Pageable paging, LocalDateTime from, LocalDateTime to, String nameLike,
			String statusCodes, Long ownerId, Boolean activeOnly, Boolean isPagination) {

		String query = ""
				// 1. filter once, narrow columns only
				+ "WITH BASE_FILTERED AS ( "
				+ "    SELECT T.ID, T.CREATED_DATE "
				+ "    FROM PUBLIC.__TABLE__ T "
				// + "    LEFT JOIN ... only what the filters need ... "
				+ "    WHERE T.SITE_ID = " + siteId + " "
				+ (from == null ? "" : "AND T.CREATED_DATE >= '" + TS.format(from) + "' ")
				+ (to == null ? "" : "AND T.CREATED_DATE <= '" + TS.format(to) + "' ")
				+ (nameLike == null ? "" : "AND T.NAME ILIKE " + nameLike + " ")
				+ (statusCodes == null ? "" : "AND T.STATUS_CODE IN (" + statusCodes + ") ")
				+ (ownerId == null ? "" : "AND T.OWNER_ID = " + ownerId + " ")
				+ (Boolean.TRUE.equals(activeOnly) ? "AND T.ACTIVE IS TRUE " : "")
				+ "), "
				// 2. one count, same WHERE
				+ "TOTAL_COUNT AS ( SELECT COUNT(*) AS total FROM BASE_FILTERED ), "
				// 3. paginate narrow ids, deterministic order
				+ "BASE AS ( "
				+ "    SELECT ID FROM BASE_FILTERED "
				+ "    ORDER BY CREATED_DATE DESC, ID DESC "
				+ (Boolean.TRUE.equals(isPagination)
						? "    LIMIT " + paging.getPageSize() + " OFFSET " + paging.getOffset() + " "
						: "")
				+ ") "
				// 4. enrich only the page's rows
				+ "SELECT TC.total, T.ID AS id, T.NAME AS name, T.STATUS_CODE AS status_code, T.CREATED_DATE AS created_date "
				+ "FROM BASE B CROSS JOIN TOTAL_COUNT TC "
				+ "JOIN PUBLIC.__TABLE__ T ON T.ID = B.ID "
				// + "LEFT JOIN LATERAL ( SELECT ... ORDER BY ... LIMIT 1 ) X ON TRUE "
				+ "ORDER BY T.CREATED_DATE DESC, T.ID DESC";
		return query;
	}
}
