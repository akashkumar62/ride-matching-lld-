package com.ridematching.matching.client;

import com.ridematching.common.response.ApiResponse;
import com.ridematching.matching.dto.UnmatchedRideView;
import lombok.RequiredArgsConstructor;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.List;

@Component
@RequiredArgsConstructor
public class RideServiceClient {

    private final RestClient rideServiceRestClient;
    private final ServiceAccountAuthClient authClient;

    public List<UnmatchedRideView> getUnmatchedRides(long olderThanSeconds) {
        try {
            return doGetUnmatchedRides(olderThanSeconds, authClient.getToken());
        } catch (RestClientResponseException e) {
            if (isUnauthorized(e)) {
                authClient.refreshToken();
                return doGetUnmatchedRides(olderThanSeconds, authClient.getToken());
            }
            throw e;
        }
    }

    private List<UnmatchedRideView> doGetUnmatchedRides(long olderThanSeconds, String token) {

        ApiResponse<List<UnmatchedRideView>> response = rideServiceRestClient.get()
                .uri(uriBuilder -> uriBuilder.path("/rides/unmatched")
                        .queryParam("olderThanSeconds", olderThanSeconds)
                        .build())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .body(new ParameterizedTypeReference<>() {
                });

        return response == null || response.getData() == null
                ? List.of()
                : response.getData();
    }

    private boolean isUnauthorized(RestClientResponseException e) {
        int status = e.getStatusCode().value();
        return status == 401 || status == 403;
    }

}
