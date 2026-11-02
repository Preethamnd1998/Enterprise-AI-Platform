package __BASE_PACKAGE__.repository;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import __BASE_PACKAGE__.dto.__Feature__RowDTO;
import __BASE_PACKAGE__.query.__Feature__SQL;

/** Custom SQL only (sql-query.md). No derived queries / findAll(Pageable). */
@Repository
public class __Feature__Repository {

	private static final Logger LOGGER = LoggerFactory.getLogger(__Feature__Repository.class);

	private final JdbcTemplate jdbcTemplate;

	public __Feature__Repository(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	public Page<__Feature__RowDTO> getList(Long siteId, Pageable paging, LocalDateTime from, LocalDateTime to,
			String nameLike, String statusCodes, Long ownerId, Boolean activeOnly) {

		// Method-local holder: this bean is a singleton, a field written in a RowMapper would race across requests.
		final long[] totalCount = { 0L };

		RowMapper<__Feature__RowDTO> mapper = (rs, rowNum) -> {
			__Feature__RowDTO dto = new __Feature__RowDTO();
			totalCount[0] = rs.getLong("total");
			dto.setId(rs.getLong("id"));
			dto.setName(rs.getString("name"));
			// ... map the rest
			return dto;
		};

		String sql = __Feature__SQL.getList(siteId, paging, from, to, nameLike, statusCodes, ownerId, activeOnly, true);
		LOGGER.info("BEFORE QUERY: getList (siteId={}, pageSize={}, offset={})", siteId, paging.getPageSize(),
				paging.getOffset());
		LOGGER.debug("SQL (truncated): {}", sql.length() > 2000 ? sql.substring(0, 2000) + "..." : sql);

		List<__Feature__RowDTO> rows;
		try {
			rows = jdbcTemplate.query(sql, mapper);
		} catch (Exception e) {
			LOGGER.error("getList failed: {}", e.getMessage(), e);
			throw e; // do not swallow: an empty page with total 0 would hide a broken query
		}
		return new PageImpl<>(rows == null ? new ArrayList<>() : rows, paging, totalCount[0]);
	}
}
