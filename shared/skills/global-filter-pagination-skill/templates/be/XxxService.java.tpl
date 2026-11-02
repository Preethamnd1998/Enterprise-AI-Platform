package __BASE_PACKAGE__.service.impl;

import java.time.LocalDateTime;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import __BASE_PACKAGE__.dto.PageDTO;
import __BASE_PACKAGE__.dto.__Feature__PagedDTO;
import __BASE_PACKAGE__.dto.__Feature__RowDTO;
import __BASE_PACKAGE__.repository.__Feature__Repository;
import __BASE_PACKAGE__.service.__Feature__Service;

@Service
public class __Feature__ServiceImpl implements __Feature__Service {

	private final __Feature__Repository repository;

	public __Feature__ServiceImpl(__Feature__Repository repository) {
		this.repository = repository;
	}

	@Override
	public __Feature__PagedDTO getList(Long siteId, int pageNo, int pageSize, LocalDateTime from, LocalDateTime to,
			String nameLike, String statusCodes, Long ownerId, Boolean activeOnly) {

		Pageable paging = PageRequest.of(pageNo, pageSize); // no Sort: the SQL class owns ORDER BY
		Page<__Feature__RowDTO> result = repository.getList(siteId, paging, from, to, nameLike, statusCodes, ownerId,
				activeOnly);

		// Optional (lists that can shrink under the user): the count-as-column CTE returns total=0 for an
		// out-of-range page. Fall back to page 0 so the UI never shows "0 records" with data present.
		if (result.isEmpty() && pageNo > 0) {
			paging = PageRequest.of(0, pageSize);
			result = repository.getList(siteId, paging, from, to, nameLike, statusCodes, ownerId, activeOnly);
		}

		return new __Feature__PagedDTO(result.getContent(), new PageDTO(result.getTotalPages(), result.getNumber(),
				result.getNumberOfElements(), result.getTotalElements()));
	}
}
