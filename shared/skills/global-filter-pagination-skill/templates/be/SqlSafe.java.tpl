package __BASE_PACKAGE__.common.util;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * PROPOSED helper (not yet in shared/standards/backend/sql-query.md — get team sign-off first).
 * Purpose: let string-built SQL (the sql-query.md format) accept request Strings without an injection surface.
 * Call at the controller/service boundary; pass only the RESULT into the *SQL class.
 */
public final class SqlSafe {

	private static final int MAX_TEXT = 100;
	private static final Pattern CODE = Pattern.compile("^[A-Za-z0-9_\\-]{1,64}$");

	private SqlSafe() {
	}

	/** Date-time from the UI (UtcService.getUtcDateTimeRange output — VERIFY exact format at the call site). */
	public static LocalDateTime dateTime(String raw) {
		if (raw == null || raw.isBlank()) {
			return null;
		}
		String v = raw.trim().replace("'", "").replace('T', ' ');
		try {
			return v.length() <= 10 ? LocalDate.parse(v).atStartOfDay()
					: LocalDateTime.parse(v.replace(' ', 'T').split("\\.")[0].replace("Z", ""));
		} catch (DateTimeParseException e) {
			throw new IllegalArgumentException("Invalid date: " + raw);
		}
	}

	/** Identifier/code: whitelist, else reject. */
	public static String code(String raw) {
		if (raw == null || raw.isBlank()) {
			return null;
		}
		String v = raw.trim();
		if (!CODE.matcher(v).matches()) {
			throw new IllegalArgumentException("Invalid code: " + raw);
		}
		return v;
	}

	/** "A,B" -> "'A','B'" with every element whitelist-validated; null if empty. */
	public static String codeList(String commaSeparated) {
		if (commaSeparated == null || commaSeparated.isBlank()) {
			return null;
		}
		List<String> parts = Arrays.stream(commaSeparated.split(",")).map(String::trim).filter(s -> !s.isEmpty())
				.map(SqlSafe::code).collect(Collectors.toList());
		return parts.isEmpty() ? null : parts.stream().map(c -> "'" + c + "'").collect(Collectors.joining(","));
	}

	/**
	 * Free text for CONTAINS search: returns a ready SQL literal, e.g. '%o''br%' ESCAPE '\'.
	 * Trims, caps length, doubles quotes, escapes LIKE wildcards. null when blank.
	 * Use as: "AND T.NAME ILIKE " + SqlSafe.likeContains(raw)
	 */
	public static String likeContains(String raw) {
		if (raw == null || raw.isBlank()) {
			return null;
		}
		String v = raw.trim();
		if (v.length() > MAX_TEXT) {
			v = v.substring(0, MAX_TEXT);
		}
		v = v.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_").replace("'", "''");
		return "'%" + v + "%' ESCAPE '\\'";
	}
}
