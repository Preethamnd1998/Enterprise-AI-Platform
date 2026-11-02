package __BASE_PACKAGE__.repository;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Repository;

import __BASE_PACKAGE__.dto.PageDTO;
import __BASE_PACKAGE__.dto.__Feature__PagedDTO;
import __BASE_PACKAGE__.dto.__Feature__RowDTO;
import __BASE_PACKAGE__.model.__Feature__Doc;

/**
 * Mongo equivalent of the SQL recipe: same params, same {data, page:PageDTO} output.
 * UNVERIFIED against a shipped Mongo list endpoint (see reference/be-mongo-format.md).
 */
@Repository
public class __Feature__MongoRepository {

	private final MongoTemplate mongoTemplate;

	public __Feature__MongoRepository(MongoTemplate mongoTemplate) {
		this.mongoTemplate = mongoTemplate;
	}

	public __Feature__PagedDTO getList(Long siteId, int pageNo, int pageSize, LocalDateTime from, LocalDateTime to,
			String search, List<String> statusCodes) {

		// One Criteria builder feeds BOTH count and find (same WHERE guarantee).
		Criteria criteria = Criteria.where("siteId").is(siteId);
		if (from != null || to != null) {
			Criteria date = Criteria.where("createdDate");
			if (from != null) {
				date = date.gte(from);
			}
			if (to != null) {
				date = date.lte(to);
			}
			criteria = new Criteria().andOperator(criteria, date);
		}
		if (search != null && !search.isBlank()) {
			String term = search.trim().length() > 100 ? search.trim().substring(0, 100) : search.trim();
			criteria = new Criteria().andOperator(criteria,
					Criteria.where("name").regex(Pattern.quote(term), "i")); // always Pattern.quote user input
		}
		if (statusCodes != null && !statusCodes.isEmpty()) {
			criteria = new Criteria().andOperator(criteria, Criteria.where("statusCode").in(statusCodes));
		}

		// COUNT BEFORE skip/limit: MongoTemplate.count honours the query's skip/limit.
		long total = mongoTemplate.count(new Query(criteria), __Feature__Doc.class);

		Query pageQuery = new Query(criteria)
				.with(Sort.by(Sort.Direction.DESC, "createdDate").and(Sort.by(Sort.Direction.DESC, "_id")))
				.skip((long) pageNo * pageSize).limit(pageSize);
		pageQuery.fields().include("id", "name", "statusCode", "createdDate");

		List<__Feature__Doc> docs = mongoTemplate.find(pageQuery, __Feature__Doc.class);
		List<__Feature__RowDTO> rows = new ArrayList<>();
		for (__Feature__Doc d : docs) {
			__Feature__RowDTO dto = new __Feature__RowDTO();
			dto.setId(d.getId());
			dto.setName(d.getName());
			rows.add(dto);
		}
		int totalPages = (int) Math.ceil((double) total / pageSize);
		return new __Feature__PagedDTO(rows, new PageDTO(totalPages, pageNo, rows.size(), total));
	}
}
