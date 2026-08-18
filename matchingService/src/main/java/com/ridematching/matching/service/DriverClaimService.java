package com.ridematching.matching.service;

import com.ridematching.common.constants.RedisKeys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.UUID;

@Service
public class DriverClaimService {

    private final StringRedisTemplate redisTemplate;
    private final long ttlSeconds;

    public DriverClaimService(StringRedisTemplate redisTemplate,
                               @Value("${matching.claim.ttl-seconds}") long ttlSeconds) {
        this.redisTemplate = redisTemplate;
        this.ttlSeconds = ttlSeconds;
    }

    public boolean tryClaim(String driverEmail, UUID rideId) {

        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(
                claimKey(driverEmail),
                rideId.toString(),
                Duration.ofSeconds(ttlSeconds));

        return Boolean.TRUE.equals(acquired);
    }

    private String claimKey(String driverEmail) {
        return RedisKeys.MATCHING_CLAIM + ":" + driverEmail;
    }

}
