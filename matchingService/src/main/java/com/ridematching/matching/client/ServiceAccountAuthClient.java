package com.ridematching.matching.client;

import com.ridematching.common.enums.UserRole;
import com.ridematching.common.response.ApiResponse;
import com.ridematching.matching.dto.LoginRequest;
import com.ridematching.matching.dto.LoginResponse;
import com.ridematching.matching.dto.RegisterRequest;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Slf4j
@Component
@RequiredArgsConstructor
public class ServiceAccountAuthClient {

    private final RestClient authServiceRestClient;

    @Value("${service.account.email}")
    private String email;

    @Value("${service.account.password}")
    private String password;

    private volatile String cachedToken;

    @PostConstruct
    public void bootstrap() {
        register();
        refreshToken();
    }

    public String getToken() {

        if (cachedToken == null) {
            refreshToken();
        }

        return cachedToken;
    }

    public synchronized void refreshToken() {

        ApiResponse<LoginResponse> response = authServiceRestClient.post()
                .uri("/auth/login")
                .body(new LoginRequest(email, password))
                .retrieve()
                .body(new ParameterizedTypeReference<>() {
                });

        this.cachedToken = response.getData().token();

        log.info("matchingService authenticated as {}", email);
    }

    private void register() {

        try {
            authServiceRestClient.post()
                    .uri("/auth/register")
                    .body(new RegisterRequest(email, password, UserRole.ADMIN))
                    .retrieve()
                    .toBodilessEntity();

            log.info("Registered matchingService service account {}", email);
        } catch (RestClientException e) {
            log.warn("Could not reach authService to register the service account (may already exist): {}",
                    e.getMessage());
        }
    }

}
