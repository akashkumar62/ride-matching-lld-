package com.ridematching.driver.client;

import com.ridematching.common.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Slf4j
@Component
@RequiredArgsConstructor
public class LocationServiceClient {

    private final RestClient locationServiceRestClient;
    private final ServiceAccountAuthClient authClient;

    public void removeLocation(String authorizationHeader) {

        try {
            locationServiceRestClient.delete()
                    .uri("/locations")
                    .header(HttpHeaders.AUTHORIZATION, authorizationHeader)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            log.warn("Failed to remove driver location from locationService: {}", e.getMessage());
        }
    }

    /** Admin-scoped removal of an arbitrary driver's location, used by the admin "all drivers" panel. */
    public void removeLocationForEmail(String email, String adminAuthorizationHeader) {

        try {
            locationServiceRestClient.delete()
                    .uri("/locations/{email}", email)
                    .header(HttpHeaders.AUTHORIZATION, adminAuthorizationHeader)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            log.warn("Failed to remove driver {} location from locationService: {}", email, e.getMessage());
        }
    }

    /** Whether the driver still has a fresh (non-expired) presence entry in locationService. */
    public boolean isPresent(String email) {

        try {
            return doCheckPresence(email, authClient.getToken());
        } catch (RestClientException e) {
            if (isUnauthorized(e)) {
                authClient.refreshToken();
                return doCheckPresence(email, authClient.getToken());
            }
            log.warn("Failed to check presence for driver {}: {}", email, e.getMessage());
            return true; // can't confirm absence — don't flip status on a transient failure
        }
    }

    private boolean doCheckPresence(String email, String token) {

        ApiResponse<Object> response = locationServiceRestClient.get()
                .uri("/locations/{email}", email)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .body(new ParameterizedTypeReference<>() {
                });

        return response != null && response.isSuccess();
    }

    private boolean isUnauthorized(RestClientException e) {
        if (!(e instanceof org.springframework.web.client.RestClientResponseException responseException)) {
            return false;
        }
        int status = responseException.getStatusCode().value();
        return status == 401 || status == 403;
    }

}
