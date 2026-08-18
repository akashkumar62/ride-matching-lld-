package com.ridematching.user.service;

import com.ridematching.user.dto.AddressResponse;
import com.ridematching.user.dto.CreateAddressRequest;
import com.ridematching.user.entity.SavedAddress;
import com.ridematching.user.entity.UserProfile;
import com.ridematching.user.repository.SavedAddressRepository;
import com.ridematching.user.repository.UserProfileRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AddressService {

    private final SavedAddressRepository addressRepository;
    private final UserProfileRepository profileRepository;

    public AddressResponse add(String email, CreateAddressRequest request) {

        UserProfile profile = profileRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Create your profile before adding an address"));

        SavedAddress address = new SavedAddress();

        address.setUserProfile(profile);
        address.setLabel(request.label());
        address.setAddressLine(request.addressLine());
        address.setLatitude(request.latitude());
        address.setLongitude(request.longitude());

        addressRepository.save(address);

        return toResponse(address);
    }

    public List<AddressResponse> list(String email) {

        return addressRepository.findByUserProfileEmail(email)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public void delete(String email, UUID addressId) {

        SavedAddress address = addressRepository.findByIdAndUserProfileEmail(addressId, email)
                .orElseThrow(() -> new RuntimeException("Address not found"));

        addressRepository.delete(address);
    }

    private AddressResponse toResponse(SavedAddress address) {

        return new AddressResponse(
                address.getId(),
                address.getLabel(),
                address.getAddressLine(),
                address.getLatitude(),
                address.getLongitude());
    }

}