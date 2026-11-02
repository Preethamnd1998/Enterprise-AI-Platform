package __BASE_PACKAGE__.dto;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Canonical paged payload: UI reads result.data and result.page. Never return a raw Spring Page<T>. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class __Feature__PagedDTO {

	private List<__Feature__RowDTO> data;

	private PageDTO page;

}
