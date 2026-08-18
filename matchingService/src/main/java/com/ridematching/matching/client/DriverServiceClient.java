package com.ridematching.matching.client;

import com.ridematching.common.enums.DriverStatus;
import com.ridematching.common.response.ApiResponse;
import com.ridematching.matching.dto.BulkStatusRequest;
import com.ridematching.matching.dto.DriverStatusView;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The authoritative check that closes the "offline driver still gets matched" gap:
 * locationService's Redis presence mirror can lag or be re-populated by a stray ping,
 * so before finalizing a claim we ask driverService — the actual source of truth for
 * a driver's own intended status — whether the candidate is really ONLINE.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DriverServiceClient {

    private final RestClient driverServiceRestClient;
    private final ServiceAccountAuthClient authClient;

    /**
     * One round trip for the whole candidate list instead of one per candidate — see
     * "batch the per-candidate check" in the Dispatch Internals write-up. Returns just
     * the subset that's actually ONLINE; anything driverService couldn't confirm as
     * ONLINE (unknown email, BUSY, OFFLINE, or a failed lookup) is simply absent.
     */
    public Set<String> onlineEmailsAmong(List<String> candidateEmails) {

        if (candidateEmails.isEmpty()) {
            return Set.of();
        }

        try {
            return doBulkStatus(candidateEmails, authClient.getToken());
        } catch (RestClientResponseException e) {
            if (isUnauthorized(e)) {
                authClient.refreshToken();
                return doBulkStatus(candidateEmails, authClient.getToken());
            }
            log.warn("Bulk status check failed for {} candidate(s): {}", candidateEmails.size(), e.getMessage());
            return Set.of();
        } catch (RestClientException e) {
            log.warn("Failed to reach driverService for bulk status check: {}", e.getMessage());
            return Set.of();
        }
    }

    private Set<String> doBulkStatus(List<String> candidateEmails, String token) {

        ApiResponse<List<DriverStatusView>> response = driverServiceRestClient.post()
                .uri("/drivers/status/bulk")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .body(new BulkStatusRequest(candidateEmails))
                .retrieve()
                .body(new ParameterizedTypeReference<>() {
                });

        if (response == null || !response.isSuccess() || response.getData() == null) {
            return Set.of();
        }

        return response.getData().stream()
                .filter(v -> v.status() == DriverStatus.ONLINE)
                .map(DriverStatusView::email)
                .collect(Collectors.toSet());
    }

    private boolean isUnauthorized(RestClientResponseException e) {
        int status = e.getStatusCode().value();
        return status == 401 || status == 403;
    }

}
